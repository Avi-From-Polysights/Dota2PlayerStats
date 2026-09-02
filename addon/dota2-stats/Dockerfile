# Build context is the REPOSITORY ROOT — the image needs the shared js/ core.
#   docker build -f addon/dota2-stats/Dockerfile -t dota2stats .
ARG BUILD_FROM=node:22-alpine
FROM ${BUILD_FROM}

ENV NODE_ENV=production
WORKDIR /app

# Shared analytics core (same modules the website runs) + the app itself.
COPY js/ ./js/
COPY addon/dota2-stats/app/ ./addon/dota2-stats/app/

# Bundle the hero list so a cold start does not depend on a network fetch.
RUN mkdir -p /app/data/constants \
    && wget -qO /app/data/constants/heroes.json \
       https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json \
    || echo "hero constants unavailable at build time — will fetch at runtime"

EXPOSE 8099

CMD ["node", "addon/dota2-stats/app/main.mjs"]
