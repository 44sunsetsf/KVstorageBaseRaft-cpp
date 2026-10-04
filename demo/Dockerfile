# Raft playground: five raftNode processes + a small Python gateway + the web page, in one image.
# Build from the repository root:  docker build -f demo/Dockerfile -t raft-playground .
# 服务器只有 1.6 GiB 内存，不要在上面构建；用 demo/deploy/deploy.sh 在本机构建 linux/amd64 镜像再传上去。

FROM ubuntu:22.04 AS build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake git ca-certificates libboost-dev libboost-serialization-dev \
      protobuf-compiler libprotobuf-dev \
    && rm -rf /var/lib/apt/lists/*
# muduo has no apt package. Pinned so the image builds the same way every time.
RUN git clone https://github.com/chenshuo/muduo.git /tmp/muduo \
    && git -C /tmp/muduo checkout f1fc77e0c13b80e5086ff457362c8a86d1b609d4 \
    && cmake -S /tmp/muduo -B /tmp/muduo/build -DCMAKE_BUILD_TYPE=Release -DMUDUO_BUILD_EXAMPLES=OFF -DBUILD_TESTING=OFF \
    && cmake --build /tmp/muduo/build -j"$(nproc)" && cmake --install /tmp/muduo/build
WORKDIR /src
COPY CMakeLists.txt ./
COPY src ./src
COPY example ./example
RUN mkdir build && cd build && cmake .. -DCMAKE_BUILD_TYPE=Release >/dev/null \
    && make -j"$(nproc)" raftNode \
    && mkdir -p /out/gateway \
    && protoc -I/src/src/raftRpcPro -I/src/src/rpc --python_out=/out/gateway \
         /src/src/raftRpcPro/kvServerRPC.proto /src/src/rpc/rpcheader.proto

FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
# python3-protobuf (3.12.4) is the same version as the protoc that generated the code above
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3-minimal python3-protobuf libprotobuf23 libboost-serialization1.74.0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /data raft && mkdir -p /data && chown raft /data
COPY --from=build /src/bin/raftNode /usr/local/bin/raftNode
COPY --from=build /out/gateway /app
COPY demo/gateway/*.py /app/
COPY demo/web /app/web
ENV WEB_DIR=/app/web DATA_DIR=/data RAFT_NODE_BIN=/usr/local/bin/raftNode PORT=8000 PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER raft
WORKDIR /app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/healthz', timeout=3).status == 200 else 1)"
CMD ["python3", "/app/server.py"]
