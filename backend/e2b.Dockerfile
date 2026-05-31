FROM e2bdev/code-interpreter:latest

ENV DEBIAN_FRONTEND=noninteractive
# Single shared persistent profile so cookies/localStorage carry across tool calls.
ENV CANDLE_BROWSER_PROFILE=/home/user/.candle_browser_profile
ENV CANDLE_BROWSER_DOWNLOADS=/home/user/downloads
# Place Playwright browser binaries in a system-wide path so they're readable
# by the non-root `user` account at runtime.
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/local/share/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    file \
    fonts-dejavu \
    fonts-noto-core \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    fonts-noto-myanmar \
    fonts-padauk \
    fonts-noto-unhinted \
    git \
    imagemagick \
    jq \
    libnss3 \
    libxss1 \
    pandoc \
    poppler-utils \
    ripgrep \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-mya \
    unzip \
    xvfb \
    zip \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --no-cache-dir --upgrade pip \
  && python3 -m pip install --no-cache-dir \
    beautifulsoup4 \
    duckduckgo-search \
    fastapi \
    httpx \
    jinja2 \
    matplotlib \
    numpy \
    openpyxl \
    pandas \
    pillow \
    playwright \
    pypdf \
    python-docx \
    python-multipart \
    python-pptx \
    requests \
    scipy \
    seaborn \
    tabulate \
    uvicorn \
    yt-dlp

# Install Chromium + its OS dependencies for in-sandbox browser automation.
# Binaries land under PLAYWRIGHT_BROWSERS_PATH (set above). chmod after the
# install so the unprivileged sandbox user can actually read + execute the
# browser binary at runtime.
RUN python3 -m playwright install --with-deps chromium \
  && chmod -R a+rX "$PLAYWRIGHT_BROWSERS_PATH"

RUN npm install -g \
    @mermaid-js/mermaid-cli \
    csv-parse \
    csv-stringify \
    jsdom \
    markdown-it \
    prettier \
    typescript

# Pre-create dirs so the browser runner doesn't race on first launch.
RUN mkdir -p /home/user/.candle_browser_profile /home/user/downloads /home/user/screenshots \
  && chown -R user:user /home/user/.candle_browser_profile /home/user/downloads /home/user/screenshots

WORKDIR /home/user

CMD ["sleep", "infinity"]
