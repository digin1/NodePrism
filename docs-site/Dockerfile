FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source
COPY . .

# Build the static site
RUN npm run build

# Serve the built site
EXPOSE 3080
CMD ["npm", "run", "serve"]
