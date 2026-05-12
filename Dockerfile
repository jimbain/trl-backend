FROM node:lts

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN npm i -g @nestjs/cli

COPY src/ai/scripts/requirements.txt /tmp/ai-requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r /tmp/ai-requirements.txt

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

CMD [ "npm", "run", "start:dev" ]
