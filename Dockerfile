# Dockerfile for Node.js Application
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

# Build the project (Vite)
RUN npm run build

# Expose the port
EXPOSE 3000

# Start the server
CMD [ "npm", "start" ]
