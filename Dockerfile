FROM node:10

# Create app directory
WORKDIR /usr/src/WaterMeTelegramBot

# Install app dependencies
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

CMD [ "npm", "run", "start:bot" ]