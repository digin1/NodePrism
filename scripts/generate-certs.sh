#!/bin/bash
#
# Generate self-signed SSL certificates for development/testing
# For production, use Let's Encrypt or a proper certificate authority
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CERTS_DIR="${PROJECT_ROOT}/infrastructure/docker/certs"

# Configuration
DOMAIN="${DOMAIN:-localhost}"
DAYS_VALID="${DAYS_VALID:-365}"
KEY_SIZE="${KEY_SIZE:-2048}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Generating self-signed SSL certificates...${NC}"
echo "Domain: $DOMAIN"
echo "Valid for: $DAYS_VALID days"
echo ""

# Create certs directory
mkdir -p "$CERTS_DIR"

# Generate private key
openssl genrsa -out "$CERTS_DIR/server.key" $KEY_SIZE

# Generate certificate signing request
openssl req -new \
    -key "$CERTS_DIR/server.key" \
    -out "$CERTS_DIR/server.csr" \
    -subj "/C=US/ST=State/L=City/O=NodePrism/OU=NodeVitals/CN=$DOMAIN"

# Create extensions file for SAN (Subject Alternative Names)
cat > "$CERTS_DIR/server.ext" << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = *.$DOMAIN
DNS.3 = localhost
DNS.4 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Generate self-signed certificate
openssl x509 -req \
    -in "$CERTS_DIR/server.csr" \
    -signkey "$CERTS_DIR/server.key" \
    -out "$CERTS_DIR/server.crt" \
    -days $DAYS_VALID \
    -extfile "$CERTS_DIR/server.ext"

# Cleanup
rm "$CERTS_DIR/server.csr" "$CERTS_DIR/server.ext"

# Set permissions
chmod 600 "$CERTS_DIR/server.key"
chmod 644 "$CERTS_DIR/server.crt"

echo ""
echo -e "${GREEN}Certificates generated successfully!${NC}"
echo ""
echo "Certificate: $CERTS_DIR/server.crt"
echo "Private Key: $CERTS_DIR/server.key"
echo ""
echo -e "${YELLOW}Note: This is a self-signed certificate for development only.${NC}"
echo -e "${YELLOW}For production, use Let's Encrypt or a proper CA.${NC}"
echo ""
echo "To use with the API, set these environment variables:"
echo "  SSL_ENABLED=true"
echo "  SSL_KEY_PATH=$CERTS_DIR/server.key"
echo "  SSL_CERT_PATH=$CERTS_DIR/server.crt"
