//
// Created by swx on 23-5-30.
//

#ifndef SKIP_LIST_ON_RAFT_PERSISTER_H
#define SKIP_LIST_ON_RAFT_PERSISTER_H
#include <mutex>
#include <string>

// 把 raft 状态和快照落到本地文件。每次写入都是“写临时文件 -> fsync -> rename -> fsync 目录”，
// 崩溃时磁盘上要么是旧文件，要么是完整的新文件，不会出现写了一半的状态。
// 构造时不清空已有文件，节点重启后可以通过 ReadRaftState / ReadSnapshot 恢复。
class Persister {
 private:
  std::mutex m_mtx;
  const std::string m_raftStateFileName;
  const std::string m_snapshotFileName;
  /**
   * 保存raftStateSize的大小
   * 避免每次都读取文件来获取具体的大小
   */
  long long m_raftStateSize;

 public:
  void Save(std::string raftstate, std::string snapshot);
  std::string ReadSnapshot();
  void SaveRaftState(const std::string& data);
  long long RaftStateSize();
  std::string ReadRaftState();
  explicit Persister(int me);
  ~Persister() = default;

 private:
  static void writeFileAtomically(const std::string& path, const std::string& data);
  static std::string readWholeFile(const std::string& path);
};

#endif  // SKIP_LIST_ON_RAFT_PERSISTER_H
