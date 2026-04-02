FROM denoland/deno:2.1.4

WORKDIR /app

COPY docker/api/server.ts .

# Cache dependencies
RUN deno cache server.ts

EXPOSE 3001

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "server.ts"]
