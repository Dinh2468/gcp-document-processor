# Su dung Node.js 20 slim lam base image
FROM node:20-slim

# Thiet lap thu muc lam viec
WORKDIR /app

# Sao chep cac file cau hinh va cai dat dependencies
COPY package*.json ./
RUN npm ci --only=production

# Sao chep toan bo ma nguon
COPY . .

# Khai bao cong cua Cloud Run
EXPOSE 8080

# Chay ung dung
CMD [ "node", "index.js" ]
