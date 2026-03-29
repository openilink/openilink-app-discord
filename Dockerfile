# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 安装构建依赖
COPY package.json package-lock.json* ./
RUN npm install

# 复制源码并编译
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# 运行阶段
FROM node:20-alpine

WORKDIR /app

# 仅安装生产依赖
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# 复制编译产物
COPY --from=builder /app/dist ./dist

# 创建数据目录
RUN mkdir -p /data

# 默认环境变量
ENV DB_PATH=/data/discord.db
ENV PORT=8083

EXPOSE 8083

# 使用非 root 用户运行
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /data
USER appuser

CMD ["node", "dist/index.js"]
