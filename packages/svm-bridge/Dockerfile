FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY client ./client
CMD ["node", "client/relayer.mjs"]
