#include "mprpcchannel.h"
#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/time.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cerrno>
#include <cstring>
#include <string>
#include "mprpccontroller.h"
#include "rpcheader.pb.h"
#include "util.h"

/*
header_size + service_name method_name args_size + args
*/
// 所有通过stub代理对象调用的rpc方法，都会走到这里了，
// 统一通过rpcChannel来调用方法
// 统一做rpc方法调用的数据数据序列化和网络发送
void MprpcChannel::CallMethod(const google::protobuf::MethodDescriptor* method,
                              google::protobuf::RpcController* controller, const google::protobuf::Message* request,
                              google::protobuf::Message* response, google::protobuf::Closure* done) {
  std::lock_guard<std::mutex> callLock(m_callMtx);
  if (m_clientFd == -1) {
    std::string errMsg;
    bool rt = newConnect(m_ip.c_str(), m_port, &errMsg);
    if (!rt) {
      DPrintf("[func-MprpcChannel::CallMethod]重连接ip：{%s} port{%d}失败", m_ip.c_str(), m_port);
      controller->SetFailed(errMsg);
      return;
    } else {
      DPrintf("[func-MprpcChannel::CallMethod]连接ip：{%s} port{%d}成功", m_ip.c_str(), m_port);
    }
  }

  const google::protobuf::ServiceDescriptor* sd = method->service();
  std::string service_name = sd->name();     // service_name
  std::string method_name = method->name();  // method_name

  // 获取参数的序列化字符串长度 args_size
  uint32_t args_size{};
  std::string args_str;
  if (request->SerializeToString(&args_str)) {
    args_size = args_str.size();
  } else {
    controller->SetFailed("serialize request error!");
    return;
  }
  RPC::RpcHeader rpcHeader;
  rpcHeader.set_service_name(service_name);
  rpcHeader.set_method_name(method_name);
  rpcHeader.set_args_size(args_size);

  std::string rpc_header_str;
  if (!rpcHeader.SerializeToString(&rpc_header_str)) {
    controller->SetFailed("serialize rpc header error!");
    return;
  }

  // 使用protobuf的CodedOutputStream来构建发送的数据流：varint32(header 长度) + header + args
  std::string payload;
  {
    google::protobuf::io::StringOutputStream string_output(&payload);
    google::protobuf::io::CodedOutputStream coded_output(&string_output);
    coded_output.WriteVarint32(static_cast<uint32_t>(rpc_header_str.size()));
    coded_output.WriteString(rpc_header_str);
  }
  payload += args_str;

  // 帧：uint32(网络字节序, payload 长度) + payload，服务端据此切分 TCP 字节流
  const uint32_t netLen = htonl(static_cast<uint32_t>(payload.size()));
  std::string frame(reinterpret_cast<const char*>(&netLen), sizeof(netLen));
  frame += payload;

  // 发送rpc请求。连接可能已被对端关闭（节点重启等），发送失败时重连一次再发
  if (!sendAll(frame.data(), frame.size())) {
    DPrintf("[func-MprpcChannel::CallMethod]发送失败，尝试重新连接 ip：{%s} port{%d}", m_ip.c_str(), m_port);
    closeConnection();
    std::string errMsg;
    if (!newConnect(m_ip.c_str(), m_port, &errMsg) || !sendAll(frame.data(), frame.size())) {
      closeConnection();
      controller->SetFailed(errMsg.empty() ? std::string("send error!") : errMsg);
      return;
    }
  }

  // 接收响应：先收 4 字节长度，再收满 payload（不再受限于一次 recv 的 1KB 缓冲区）
  uint32_t respNetLen = 0;
  if (!recvAll(reinterpret_cast<char*>(&respNetLen), sizeof(respNetLen))) {
    char errtxt[512] = {0};
    sprintf(errtxt, "recv error! errno:%d", errno);
    closeConnection();
    controller->SetFailed(errtxt);
    return;
  }
  std::string respBuf(ntohl(respNetLen), '\0');
  if (!recvAll(&respBuf[0], respBuf.size())) {
    char errtxt[512] = {0};
    sprintf(errtxt, "recv error! errno:%d", errno);
    closeConnection();
    controller->SetFailed(errtxt);
    return;
  }

  if (!response->ParseFromString(respBuf)) {
    controller->SetFailed("parse error! bad response");
    closeConnection();  // 流可能已错位，丢弃这条连接
    return;
  }
}

void MprpcChannel::closeConnection() {
  if (m_clientFd != -1) {
    close(m_clientFd);
    m_clientFd = -1;
  }
}

bool MprpcChannel::sendAll(const char* data, size_t len) {
  if (m_clientFd == -1) {
    return false;
  }
  size_t sent = 0;
  while (sent < len) {
    // MSG_NOSIGNAL：对端已关闭时返回 EPIPE，而不是让整个进程收到 SIGPIPE 被杀掉
    ssize_t n = send(m_clientFd, data + sent, len - sent, MSG_NOSIGNAL);
    if (n < 0) {
      if (errno == EINTR) {
        continue;
      }
      return false;
    }
    sent += static_cast<size_t>(n);
  }
  return true;
}

bool MprpcChannel::recvAll(char* data, size_t len) {
  size_t got = 0;
  while (got < len) {
    ssize_t n = recv(m_clientFd, data + got, len - got, 0);
    if (n == 0) {
      errno = ECONNRESET;  // 对端关闭
      return false;
    }
    if (n < 0) {
      if (errno == EINTR) {
        continue;
      }
      return false;  // 包括 SO_RCVTIMEO 超时（EAGAIN）
    }
    got += static_cast<size_t>(n);
  }
  return true;
}

bool MprpcChannel::newConnect(const char* ip, uint16_t port, string* errMsg) {
  int clientfd = socket(AF_INET, SOCK_STREAM, 0);
  if (-1 == clientfd) {
    char errtxt[512] = {0};
    sprintf(errtxt, "create socket error! errno:%d", errno);
    m_clientFd = -1;
    *errMsg = errtxt;
    return false;
  }

  struct sockaddr_in server_addr;
  server_addr.sin_family = AF_INET;
  server_addr.sin_port = htons(port);
  server_addr.sin_addr.s_addr = inet_addr(ip);
  // 连接rpc服务节点
  if (-1 == connect(clientfd, (struct sockaddr*)&server_addr, sizeof(server_addr))) {
    close(clientfd);
    char errtxt[512] = {0};
    sprintf(errtxt, "connect fail! errno:%d", errno);
    m_clientFd = -1;
    *errMsg = errtxt;
    return false;
  }
  // 超时保护：对端卡死时不会让调用线程永远阻塞；关闭 Nagle，小包请求/响应不再等待合并
  struct timeval tv;
  tv.tv_sec = 3;
  tv.tv_usec = 0;
  setsockopt(clientfd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
  int one = 1;
  setsockopt(clientfd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));
  m_clientFd = clientfd;
  return true;
}

MprpcChannel::MprpcChannel(string ip, short port, bool connectNow) : m_ip(ip), m_port(port), m_clientFd(-1) {
  // 使用tcp编程，完成rpc方法的远程调用，使用的是短连接，因此每次都要重新连接上去，待改成长连接。
  // 没有连接或者连接已经断开，那么就要重新连接呢,会一直不断地重试
  // 读取配置文件rpcserver的信息
  // std::string ip = MprpcApplication::GetInstance().GetConfig().Load("rpcserverip");
  // uint16_t port = atoi(MprpcApplication::GetInstance().GetConfig().Load("rpcserverport").c_str());
  // rpc调用方想调用service_name的method_name服务，需要查询zk上该服务所在的host信息
  //  /UserServiceRpc/Login
  if (!connectNow) {
    return;
  }  //可以允许延迟连接
  std::string errMsg;
  auto rt = newConnect(ip.c_str(), port, &errMsg);
  int tryCount = 3;
  while (!rt && tryCount--) {
    std::cout << errMsg << std::endl;
    rt = newConnect(ip.c_str(), port, &errMsg);
  }
}