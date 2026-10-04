//
// Created by swx on 23-5-30.
//
#include "Persister.h"
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include "config.h"
#include "util.h"

namespace {
// 持久化失败时继续对外回复会破坏 Raft 的安全性，所以直接终止进程，让节点按崩溃处理。
[[noreturn]] void persistFatal(const std::string& what, const std::string& path) {
  std::fprintf(stderr, "[Persister] %s failed on %s: %s\n", what.c_str(), path.c_str(), std::strerror(errno));
  std::abort();
}
}  // namespace

void Persister::writeFileAtomically(const std::string& path, const std::string& data) {
  const std::string tmpPath = path + ".tmp";
  int fd = ::open(tmpPath.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (fd < 0) {
    persistFatal("open", tmpPath);
  }
  const char* p = data.data();
  size_t left = data.size();
  while (left > 0) {
    ssize_t n = ::write(fd, p, left);
    if (n < 0) {
      if (errno == EINTR) {
        continue;
      }
      persistFatal("write", tmpPath);
    }
    p += n;
    left -= static_cast<size_t>(n);
  }
  if (PERSIST_FSYNC && ::fsync(fd) != 0) {
    persistFatal("fsync", tmpPath);
  }
  ::close(fd);
  if (::rename(tmpPath.c_str(), path.c_str()) != 0) {
    persistFatal("rename", tmpPath);
  }
  if (PERSIST_FSYNC) {
    // rename 本身也要落盘，否则断电后可能还是旧文件
    auto slash = path.find_last_of('/');
    const std::string dir = slash == std::string::npos ? "." : path.substr(0, slash);
    int dfd = ::open(dir.c_str(), O_RDONLY);
    if (dfd >= 0) {
      ::fsync(dfd);
      ::close(dfd);
    }
  }
}

std::string Persister::readWholeFile(const std::string& path) {
  std::ifstream ifs(path, std::ios::in | std::ios::binary);
  if (!ifs.good()) {
    return "";
  }
  std::stringstream ss;
  ss << ifs.rdbuf();
  return ss.str();
}

void Persister::Save(const std::string raftstate, const std::string snapshot) {
  std::lock_guard<std::mutex> lg(m_mtx);
  // 先写快照再写 raft 状态：中途崩溃时最多是“快照比日志新”，旧日志仍然完整，重放由去重表兜底；
  // 反过来则会出现日志已被截断但快照还是旧的，数据就丢了。
  writeFileAtomically(m_snapshotFileName, snapshot);
  writeFileAtomically(m_raftStateFileName, raftstate);
  m_raftStateSize = raftstate.size();
}

std::string Persister::ReadSnapshot() {
  std::lock_guard<std::mutex> lg(m_mtx);
  return readWholeFile(m_snapshotFileName);
}

void Persister::SaveRaftState(const std::string& data) {
  std::lock_guard<std::mutex> lg(m_mtx);
  writeFileAtomically(m_raftStateFileName, data);
  m_raftStateSize = data.size();
}

long long Persister::RaftStateSize() {
  std::lock_guard<std::mutex> lg(m_mtx);
  return m_raftStateSize;
}

std::string Persister::ReadRaftState() {
  std::lock_guard<std::mutex> lg(m_mtx);
  return readWholeFile(m_raftStateFileName);
}

Persister::Persister(const int me)
    : m_raftStateFileName("raftstatePersist" + std::to_string(me) + ".txt"),
      m_snapshotFileName("snapshotPersist" + std::to_string(me) + ".txt"),
      m_raftStateSize(0) {
  // 不清空已有文件：重启后要靠它们恢复。上次崩溃可能留下 .tmp，直接丢弃。
  std::remove((m_raftStateFileName + ".tmp").c_str());
  std::remove((m_snapshotFileName + ".tmp").c_str());
  struct stat st;
  if (::stat(m_raftStateFileName.c_str(), &st) == 0) {
    m_raftStateSize = st.st_size;
  }
}
