FROM node:22-alpine

WORKDIR /app

# No third-party runtime dependencies: the service is built on node:http so the
# image stays small and the dev stack needs no registry access at boot.
COPY package.json server.mjs ./

ENV NODE_ENV=production
EXPOSE 8081

USER node

CMD ["node", "server.mjs"]