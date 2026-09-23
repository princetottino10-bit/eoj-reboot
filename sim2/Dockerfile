# sim2 online server (lobby, rooms, and the AI table at /ai). Zero dependencies:
# the server strips TypeScript types itself, so the image only needs Node 24.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY src ./src
COPY play ./play
COPY online ./online
COPY data ./data
# Rooms live in memory. Match records go to /app/out/online, which fly.toml
# mounts as the "records" volume: the directory is created here so a fresh
# volume is seeded with it (owner included). The server re-creates it at start
# anyway and, if it still cannot write there, says so and keeps serving.
RUN mkdir -p /app/out/online && chown -R node:node /app/out
USER node
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "online/server.ts", "--host", "0.0.0.0", "--port", "8080", "--trust-proxy", "--record-dir", "/app/out/online"]
