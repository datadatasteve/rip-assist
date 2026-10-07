#!/bin/sh
# Joins the tailnet (if TS_AUTHKEY is set) so the API can reach Ollama at its
# Tailscale IP, then starts the API. Without TS_AUTHKEY it just starts the API
# and AI calls fall through to cloud providers.
set -e

if [ -n "$TS_AUTHKEY" ]; then
  tailscaled --tun=userspace-networking --state=mem: \
    --outbound-http-proxy-listen=localhost:1055 --socks5-server=localhost:1056 >/tmp/tailscaled.log 2>&1 &
  i=0
  until tailscale up --authkey="$TS_AUTHKEY" --hostname="${TS_HOSTNAME:-rip-assist-api}" --accept-dns=false; do
    i=$((i+1)); [ $i -ge 5 ] && echo "tailscale up failed; continuing without tailnet" && break
    sleep 1
  done
  export OLLAMA_PROXY="http://localhost:1055"
fi

exec uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
