FROM node:20-alpine as builder

WORKDIR /siwe-oidc

# Reference https://github.com/mhart/alpine-node/issues/27#issuecomment-880663905
RUN apk add --no-cache --virtual .build-deps alpine-sdk python3

ARG INFURA_ID
ARG WALLET_CONNECT_ID

ENV INFURA_ID=${INFURA_ID}
ENV WALLET_CONNECT_ID=${WALLET_CONNECT_ID}

# Copy static files and UI
ADD --chown=node:node ./static /siwe-oidc/static
ADD --chown=node:node ./js/ui /siwe-oidc/js/ui
WORKDIR /siwe-oidc/js/ui
RUN yarn
RUN yarn build

# Build the Node.js application
FROM node:20-alpine

WORKDIR /siwe-oidc
COPY ./siwe-oidc-js ./siwe-oidc-js
WORKDIR /siwe-oidc/siwe-oidc-js

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Copy static files from builder
COPY --from=builder /siwe-oidc/static/ ./static/

# Generate RSA key if not provided
RUN if [ -z "$RSA_PEM" ]; then \
    apk add --no-cache openssl && \
    openssl genrsa -out /tmp/private.pem 2048 && \
    export RSA_PEM=$(cat /tmp/private.pem) && \
    rm /tmp/private.pem; \
    fi

# Set environment variables
ENV SIWEOIDC_ADDRESS="0.0.0.0"
# Expose port
EXPOSE 8000
# Start the application
CMD ["npm", "start"]

# Labels
LABEL org.opencontainers.image.source https://github.com/spruceid/siwe-oidc
LABEL org.opencontainers.image.description "OpenID Connect Identity Provider for Sign-In with Ethereum"
LABEL org.opencontainers.image.licenses "MIT OR Apache-2.0"
