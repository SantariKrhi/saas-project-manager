FROM node:20-alpine
WORKDIR /usr/src/app

# Versions figées par package-lock.json : build reproductible
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
