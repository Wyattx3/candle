FROM e2bdev/code-interpreter:latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    file \
    git \
    imagemagick \
    jq \
    libnss3 \
    libxss1 \
    pandoc \
    poppler-utils \
    ripgrep \
    unzip \
    zip \
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

RUN npm install -g \
    @mermaid-js/mermaid-cli \
    csv-parse \
    csv-stringify \
    jsdom \
    markdown-it \
    prettier \
    typescript

WORKDIR /home/user

CMD ["sleep", "infinity"]
