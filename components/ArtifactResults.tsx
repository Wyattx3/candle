import React, { memo, useMemo } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  Archive,
  Code2,
  Database,
  Download,
  File,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Globe,
  Music,
  Package,
  Presentation,
} from 'lucide-react-native';

type ArtifactKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'data'
  | 'code'
  | 'archive'
  | 'model'
  | 'web'
  | 'generic';

type ArtifactDefinition = {
  extension: string;
  label: string;
  kind: ArtifactKind;
  mimeHint: string;
};

export type ArtifactItem = {
  id: string;
  url: string;
  name: string;
  extension: string;
  definition: ArtifactDefinition;
  sizeLabel?: string;
};

export const ARTIFACT_FORMATS: readonly ArtifactDefinition[] = [
  { extension: 'png', label: 'PNG image', kind: 'image', mimeHint: 'image/png' },
  { extension: 'jpg', label: 'JPEG image', kind: 'image', mimeHint: 'image/jpeg' },
  { extension: 'jpeg', label: 'JPEG image', kind: 'image', mimeHint: 'image/jpeg' },
  { extension: 'webp', label: 'WebP image', kind: 'image', mimeHint: 'image/webp' },
  { extension: 'gif', label: 'GIF image', kind: 'image', mimeHint: 'image/gif' },
  { extension: 'bmp', label: 'Bitmap image', kind: 'image', mimeHint: 'image/bmp' },
  { extension: 'tiff', label: 'TIFF image', kind: 'image', mimeHint: 'image/tiff' },
  { extension: 'tif', label: 'TIFF image', kind: 'image', mimeHint: 'image/tiff' },
  { extension: 'heic', label: 'HEIC image', kind: 'image', mimeHint: 'image/heic' },
  { extension: 'avif', label: 'AVIF image', kind: 'image', mimeHint: 'image/avif' },
  { extension: 'svg', label: 'SVG vector', kind: 'image', mimeHint: 'image/svg+xml' },
  { extension: 'ico', label: 'Icon file', kind: 'image', mimeHint: 'image/x-icon' },
  { extension: 'mp4', label: 'MP4 video', kind: 'video', mimeHint: 'video/mp4' },
  { extension: 'mov', label: 'QuickTime video', kind: 'video', mimeHint: 'video/quicktime' },
  { extension: 'webm', label: 'WebM video', kind: 'video', mimeHint: 'video/webm' },
  { extension: 'mkv', label: 'Matroska video', kind: 'video', mimeHint: 'video/x-matroska' },
  { extension: 'avi', label: 'AVI video', kind: 'video', mimeHint: 'video/x-msvideo' },
  { extension: 'm4v', label: 'M4V video', kind: 'video', mimeHint: 'video/x-m4v' },
  { extension: '3gp', label: '3GP video', kind: 'video', mimeHint: 'video/3gpp' },
  { extension: 'mpeg', label: 'MPEG video', kind: 'video', mimeHint: 'video/mpeg' },
  { extension: 'mpg', label: 'MPEG video', kind: 'video', mimeHint: 'video/mpeg' },
  { extension: 'ts', label: 'Transport stream', kind: 'video', mimeHint: 'video/mp2t' },
  { extension: 'm3u8', label: 'HLS playlist', kind: 'video', mimeHint: 'application/vnd.apple.mpegurl' },
  { extension: 'mp3', label: 'MP3 audio', kind: 'audio', mimeHint: 'audio/mpeg' },
  { extension: 'wav', label: 'WAV audio', kind: 'audio', mimeHint: 'audio/wav' },
  { extension: 'm4a', label: 'M4A audio', kind: 'audio', mimeHint: 'audio/mp4' },
  { extension: 'aac', label: 'AAC audio', kind: 'audio', mimeHint: 'audio/aac' },
  { extension: 'ogg', label: 'Ogg audio', kind: 'audio', mimeHint: 'audio/ogg' },
  { extension: 'flac', label: 'FLAC audio', kind: 'audio', mimeHint: 'audio/flac' },
  { extension: 'opus', label: 'Opus audio', kind: 'audio', mimeHint: 'audio/opus' },
  { extension: 'wma', label: 'Windows audio', kind: 'audio', mimeHint: 'audio/x-ms-wma' },
  { extension: 'aiff', label: 'AIFF audio', kind: 'audio', mimeHint: 'audio/aiff' },
  { extension: 'mid', label: 'MIDI audio', kind: 'audio', mimeHint: 'audio/midi' },
  { extension: 'pdf', label: 'PDF document', kind: 'pdf', mimeHint: 'application/pdf' },
  { extension: 'docx', label: 'Word document', kind: 'document', mimeHint: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { extension: 'doc', label: 'Word document', kind: 'document', mimeHint: 'application/msword' },
  { extension: 'rtf', label: 'Rich text document', kind: 'document', mimeHint: 'application/rtf' },
  { extension: 'odt', label: 'OpenDocument text', kind: 'document', mimeHint: 'application/vnd.oasis.opendocument.text' },
  { extension: 'txt', label: 'Text file', kind: 'document', mimeHint: 'text/plain' },
  { extension: 'md', label: 'Markdown file', kind: 'document', mimeHint: 'text/markdown' },
  { extension: 'html', label: 'HTML document', kind: 'document', mimeHint: 'text/html' },
  { extension: 'htm', label: 'HTML document', kind: 'document', mimeHint: 'text/html' },
  { extension: 'epub', label: 'EPUB ebook', kind: 'document', mimeHint: 'application/epub+zip' },
  { extension: 'tex', label: 'LaTeX document', kind: 'document', mimeHint: 'application/x-tex' },
  { extension: 'pages', label: 'Pages document', kind: 'document', mimeHint: 'application/x-iwork-pages-sffpages' },
  { extension: 'xlsx', label: 'Excel spreadsheet', kind: 'spreadsheet', mimeHint: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { extension: 'xls', label: 'Excel spreadsheet', kind: 'spreadsheet', mimeHint: 'application/vnd.ms-excel' },
  { extension: 'csv', label: 'CSV dataset', kind: 'spreadsheet', mimeHint: 'text/csv' },
  { extension: 'tsv', label: 'TSV dataset', kind: 'spreadsheet', mimeHint: 'text/tab-separated-values' },
  { extension: 'ods', label: 'OpenDocument spreadsheet', kind: 'spreadsheet', mimeHint: 'application/vnd.oasis.opendocument.spreadsheet' },
  { extension: 'numbers', label: 'Numbers spreadsheet', kind: 'spreadsheet', mimeHint: 'application/x-iwork-numbers-sffnumbers' },
  { extension: 'parquet', label: 'Parquet dataset', kind: 'data', mimeHint: 'application/octet-stream' },
  { extension: 'feather', label: 'Feather dataset', kind: 'data', mimeHint: 'application/octet-stream' },
  { extension: 'arrow', label: 'Arrow dataset', kind: 'data', mimeHint: 'application/vnd.apache.arrow.file' },
  { extension: 'pptx', label: 'PowerPoint deck', kind: 'presentation', mimeHint: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { extension: 'ppt', label: 'PowerPoint deck', kind: 'presentation', mimeHint: 'application/vnd.ms-powerpoint' },
  { extension: 'key', label: 'Keynote deck', kind: 'presentation', mimeHint: 'application/x-iwork-keynote-sffkey' },
  { extension: 'odp', label: 'OpenDocument deck', kind: 'presentation', mimeHint: 'application/vnd.oasis.opendocument.presentation' },
  { extension: 'json', label: 'JSON data', kind: 'data', mimeHint: 'application/json' },
  { extension: 'jsonl', label: 'JSON Lines data', kind: 'data', mimeHint: 'application/x-ndjson' },
  { extension: 'xml', label: 'XML data', kind: 'data', mimeHint: 'application/xml' },
  { extension: 'yaml', label: 'YAML data', kind: 'data', mimeHint: 'application/yaml' },
  { extension: 'yml', label: 'YAML data', kind: 'data', mimeHint: 'application/yaml' },
  { extension: 'toml', label: 'TOML config', kind: 'data', mimeHint: 'application/toml' },
  { extension: 'ini', label: 'INI config', kind: 'data', mimeHint: 'text/plain' },
  { extension: 'log', label: 'Log file', kind: 'document', mimeHint: 'text/plain' },
  { extension: 'sql', label: 'SQL script', kind: 'code', mimeHint: 'application/sql' },
  { extension: 'db', label: 'Database file', kind: 'data', mimeHint: 'application/octet-stream' },
  { extension: 'sqlite', label: 'SQLite database', kind: 'data', mimeHint: 'application/vnd.sqlite3' },
  { extension: 'py', label: 'Python code', kind: 'code', mimeHint: 'text/x-python' },
  { extension: 'js', label: 'JavaScript code', kind: 'code', mimeHint: 'text/javascript' },
  { extension: 'ts', label: 'TypeScript code', kind: 'code', mimeHint: 'text/typescript' },
  { extension: 'jsx', label: 'React JSX code', kind: 'code', mimeHint: 'text/jsx' },
  { extension: 'tsx', label: 'React TSX code', kind: 'code', mimeHint: 'text/tsx' },
  { extension: 'css', label: 'CSS stylesheet', kind: 'code', mimeHint: 'text/css' },
  { extension: 'scss', label: 'SCSS stylesheet', kind: 'code', mimeHint: 'text/x-scss' },
  { extension: 'java', label: 'Java code', kind: 'code', mimeHint: 'text/x-java-source' },
  { extension: 'kt', label: 'Kotlin code', kind: 'code', mimeHint: 'text/x-kotlin' },
  { extension: 'swift', label: 'Swift code', kind: 'code', mimeHint: 'text/x-swift' },
  { extension: 'go', label: 'Go code', kind: 'code', mimeHint: 'text/x-go' },
  { extension: 'rs', label: 'Rust code', kind: 'code', mimeHint: 'text/rust' },
  { extension: 'c', label: 'C code', kind: 'code', mimeHint: 'text/x-c' },
  { extension: 'cpp', label: 'C++ code', kind: 'code', mimeHint: 'text/x-c++src' },
  { extension: 'h', label: 'C header', kind: 'code', mimeHint: 'text/x-c' },
  { extension: 'php', label: 'PHP code', kind: 'code', mimeHint: 'application/x-httpd-php' },
  { extension: 'rb', label: 'Ruby code', kind: 'code', mimeHint: 'text/x-ruby' },
  { extension: 'sh', label: 'Shell script', kind: 'code', mimeHint: 'application/x-sh' },
  { extension: 'bat', label: 'Batch script', kind: 'code', mimeHint: 'application/x-msdos-program' },
  { extension: 'ps1', label: 'PowerShell script', kind: 'code', mimeHint: 'text/plain' },
  { extension: 'zip', label: 'ZIP archive', kind: 'archive', mimeHint: 'application/zip' },
  { extension: 'tar', label: 'TAR archive', kind: 'archive', mimeHint: 'application/x-tar' },
  { extension: 'gz', label: 'Gzip archive', kind: 'archive', mimeHint: 'application/gzip' },
  { extension: 'rar', label: 'RAR archive', kind: 'archive', mimeHint: 'application/vnd.rar' },
  { extension: '7z', label: '7-Zip archive', kind: 'archive', mimeHint: 'application/x-7z-compressed' },
  { extension: 'blend', label: 'Blender scene', kind: 'model', mimeHint: 'application/octet-stream' },
  { extension: 'glb', label: 'GLB 3D model', kind: 'model', mimeHint: 'model/gltf-binary' },
  { extension: 'gltf', label: 'glTF 3D model', kind: 'model', mimeHint: 'model/gltf+json' },
  { extension: 'obj', label: 'OBJ 3D model', kind: 'model', mimeHint: 'model/obj' },
  { extension: 'usdz', label: 'USDZ 3D model', kind: 'model', mimeHint: 'model/vnd.usdz+zip' },
  { extension: 'wasm', label: 'WebAssembly module', kind: 'code', mimeHint: 'application/wasm' },
] as const;

const FORMAT_BY_EXTENSION = new Map(ARTIFACT_FORMATS.map((item) => [item.extension, item]));
const GENERIC_FORMAT: ArtifactDefinition = { extension: 'file', label: 'File', kind: 'generic', mimeHint: 'application/octet-stream' };

function normalizeUrl(raw: string) {
  return raw.replace(/[)\].,;!?]+$/g, '');
}

function getUrlFileName(url: string) {
  try {
    const parsed = new URL(url);
    const pathFromQuery = parsed.searchParams.get('path');
    const source = pathFromQuery || parsed.pathname;
    const decoded = decodeURIComponent(source);
    const last = decoded.split('/').filter(Boolean).pop();
    return last || parsed.hostname;
  } catch {
    const clean = url.split('?')[0];
    return clean.split('/').filter(Boolean).pop() || 'artifact';
  }
}

function getExtension(nameOrUrl: string) {
  const name = getUrlFileName(nameOrUrl).toLowerCase();
  const match = name.match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

function formatArtifactTitle(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Generated file';
}

function isSandboxFileUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('.e2b.app') && parsed.pathname === '/files' && parsed.searchParams.has('path');
  } catch {
    return false;
  }
}

function getArtifactDefinition(url: string, name?: string): { extension: string; definition: ArtifactDefinition } | undefined {
  const extension = getExtension(name || url);
  const definition = FORMAT_BY_EXTENSION.get(extension);
  if (definition) return { extension, definition };
  if (isSandboxFileUrl(url)) return { extension: 'file', definition: GENERIC_FORMAT };
  return undefined;
}

export function isArtifactUrl(url: string, name?: string) {
  return Boolean(getArtifactDefinition(normalizeUrl(url), name));
}

function extractJsonArtifacts(text: string): ArtifactItem[] {
  const candidates = text.match(/\{[^{}]*"url"[^{}]*\}/g) ?? [];
  return candidates.flatMap((candidate) => {
    try {
      const parsed = JSON.parse(candidate) as { url?: string; path?: string; name?: string };
      if (!parsed.url) return [];
      const url = normalizeUrl(parsed.url);
      const name = parsed.name || (parsed.path ? parsed.path.split('/').pop() : undefined) || getUrlFileName(url);
      const artifact = getArtifactDefinition(url, name);
      if (!artifact) return [];
      const { extension, definition } = artifact;
      return [{ id: `${url}-${name}`, url, name, extension, definition }];
    } catch {
      return [];
    }
  });
}

export function extractArtifactsFromText(text: string): ArtifactItem[] {
  const jsonArtifacts = extractJsonArtifacts(text);
  const markdownLinks = [...text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => ({
    name: match[1],
    url: normalizeUrl(match[2]),
  }));
  const rawUrls = [...text.matchAll(/https?:\/\/[^\s<>"']+/g)].map((match) => ({
    name: getUrlFileName(normalizeUrl(match[0])),
    url: normalizeUrl(match[0]),
  }));

  const dedupe = new Map<string, ArtifactItem>();
  [...jsonArtifacts, ...markdownLinks, ...rawUrls].forEach((item: any) => {
    const url = normalizeUrl(item.url);
    const name = formatArtifactTitle(item.name || getUrlFileName(url));
    const artifact = getArtifactDefinition(url, name);
    if (!artifact) return;
    const { extension, definition } = artifact;
    if (!url || dedupe.has(url)) return;
    dedupe.set(url, { id: url, url, name, extension: extension || definition.extension, definition });
  });

  return [...dedupe.values()];
}

export function stripArtifactLinksFromText(text: string) {
  let cleaned = text;

  cleaned = cleaned.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (full, label, url) => (
    isArtifactUrl(url, label) ? label : full
  ));

  cleaned = cleaned.replace(/https?:\/\/[^\s<>"']+/g, (url) => (
    isArtifactUrl(url) ? '' : url
  ));

  cleaned = cleaned
    .replace(/^\s*(download\s+url|download\s+link|link)\s*:?\s*$/gim, '')
    .replace(/^\s*(download\s+url|download\s+link|download\s+link)\s*:.*$/gim, '')
    .replace(/^The link is temporary.*$/gim, '')
    .replace(/^This link is temporary.*$/gim, '')
    .replace(/^\s*\[[^\]]+\]\s*$/gim, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

function iconForKind(kind: ArtifactKind) {
  if (kind === 'image') return FileImage;
  if (kind === 'video') return FileVideo;
  if (kind === 'audio') return FileAudio;
  if (kind === 'pdf') return FileText;
  if (kind === 'document') return FileText;
  if (kind === 'spreadsheet') return FileSpreadsheet;
  if (kind === 'presentation') return Presentation;
  if (kind === 'data') return Database;
  if (kind === 'code') return Code2;
  if (kind === 'archive') return Archive;
  if (kind === 'model') return Package;
  if (kind === 'web') return Globe;
  return File;
}

const VideoPreview: React.FC<{ item: ArtifactItem }> = ({ item }) => {
  const player = useVideoPlayer(item.url, (instance) => {
    instance.loop = false;
    instance.muted = true;
  });

  return (
    <View style={styles.videoPreview}>
      <VideoView player={player} style={styles.video} contentFit="cover" nativeControls />
    </View>
  );
};

const AudioPreview: React.FC<{ item: ArtifactItem }> = ({ item }) => (
  <TouchableOpacity style={styles.audioPreview} onPress={() => Linking.openURL(item.url)} activeOpacity={0.75}>
    <Music size={26} color="#EF4444" />
    <View style={styles.waveRow}>
      {Array.from({ length: 22 }).map((_, index) => (
        <View key={index} style={[styles.waveBar, { height: 8 + ((index * 7) % 22) }]} />
      ))}
    </View>
  </TouchableOpacity>
);

const ImagePreview: React.FC<{ item: ArtifactItem }> = ({ item }) => (
  <Image source={{ uri: item.url }} style={styles.imagePreview} resizeMode="cover" />
);

const DocumentPreview: React.FC<{ item: ArtifactItem }> = ({ item }) => {
  const Icon = iconForKind(item.definition.kind);
  const isDeck = item.definition.kind === 'presentation';
  const isSheet = item.definition.kind === 'spreadsheet' || item.definition.kind === 'data';
  return (
    <View style={[styles.documentPreview, isDeck && styles.deckPreview, isSheet && styles.sheetPreview]}>
      <View style={styles.previewTopLine} />
      <View style={styles.previewBody}>
        <Icon size={22} color={isDeck ? '#2563EB' : isSheet ? '#059669' : '#4B5563'} />
        <View style={styles.previewTextColumn}>
          <View style={styles.fakeLineWide} />
          <View style={styles.fakeLineMedium} />
          <View style={styles.fakeLineShort} />
        </View>
      </View>
      {isDeck ? (
        <View style={styles.slideDots}>
          <View style={styles.slideDot} />
          <View style={styles.slideDotDim} />
          <View style={styles.slideDotDim} />
        </View>
      ) : null}
    </View>
  );
};

const CodePreview: React.FC<{ item: ArtifactItem }> = ({ item }) => (
  <View style={styles.codePreview}>
    <Text style={styles.codeLine}>const result = await task.run();</Text>
    <Text style={styles.codeLineMuted}>return artifact.url;</Text>
    <Text style={styles.codeLineAccent}>{`// ${item.extension || 'code'}`}</Text>
  </View>
);

const ArtifactPreview: React.FC<{ item: ArtifactItem }> = ({ item }) => {
  if (item.definition.kind === 'image') return <ImagePreview item={item} />;
  if (item.definition.kind === 'video') return <VideoPreview item={item} />;
  if (item.definition.kind === 'audio') return <AudioPreview item={item} />;
  if (item.definition.kind === 'code') return <CodePreview item={item} />;
  return <DocumentPreview item={item} />;
};

const ArtifactCard: React.FC<{ item: ArtifactItem }> = ({ item }) => {
  const Icon = iconForKind(item.definition.kind);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.fileIcon}>
          <Icon size={18} color="#111827" />
        </View>
        <View style={styles.titleColumn}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>{item.definition.label}</Text>
        </View>
        <TouchableOpacity style={styles.downloadButton} onPress={() => Linking.openURL(item.url)} activeOpacity={0.75}>
          <Download size={16} color="#111827" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => Linking.openURL(item.url)} activeOpacity={0.85}>
        <ArtifactPreview item={item} />
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => Linking.openURL(item.url)} activeOpacity={0.75}>
          <Text style={styles.actionText}>Preview</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.primaryAction]} onPress={() => Linking.openURL(item.url)} activeOpacity={0.75}>
          <Text style={styles.primaryActionText}>Open</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const ArtifactResultsComponent: React.FC<{ sources: string[] }> = ({ sources }) => {
  const artifacts = useMemo(() => {
    const map = new Map<string, ArtifactItem>();
    sources.flatMap(extractArtifactsFromText).forEach((item) => map.set(item.url, item));
    return [...map.values()];
  }, [sources]);

  if (artifacts.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryTitle}>All files</Text>
        <Text style={styles.summaryCount}>{artifacts.length}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroller}>
        {artifacts.map((item) => <ArtifactCard key={item.id} item={item} />)}
      </ScrollView>
    </View>
  );
};

export const ArtifactResults = memo(ArtifactResultsComponent);

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  summaryCount: {
    marginLeft: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  scroller: {
    paddingRight: 10,
    gap: 10,
  },
  card: {
    width: 184,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  fileIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  meta: {
    marginTop: 1,
    fontSize: 10,
    color: '#6B7280',
  },
  downloadButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreview: {
    height: 72,
    width: '100%',
    backgroundColor: '#EEF2FF',
  },
  videoPreview: {
    height: 72,
    backgroundColor: '#111827',
  },
  video: {
    width: '100%',
    height: 72,
  },
  audioPreview: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    backgroundColor: '#FFF1F2',
  },
  waveRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 14,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#F87171',
  },
  documentPreview: {
    height: 66,
    backgroundColor: '#F9FAFB',
    padding: 10,
  },
  deckPreview: {
    backgroundColor: '#111827',
  },
  sheetPreview: {
    backgroundColor: '#ECFDF5',
  },
  previewTopLine: {
    width: 42,
    height: 4,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginBottom: 10,
  },
  previewBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewTextColumn: {
    flex: 1,
    marginLeft: 12,
    gap: 8,
  },
  fakeLineWide: {
    width: '86%',
    height: 5,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  fakeLineMedium: {
    width: '62%',
    height: 5,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  fakeLineShort: {
    width: '42%',
    height: 5,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  slideDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  slideDot: {
    width: 22,
    height: 5,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  slideDotDim: {
    width: 22,
    height: 5,
    borderRadius: 4,
    backgroundColor: '#374151',
  },
  codePreview: {
    height: 72,
    backgroundColor: '#111827',
    padding: 10,
    justifyContent: 'center',
    gap: 8,
  },
  codeLine: {
    color: '#E5E7EB',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  codeLineMuted: {
    color: '#9CA3AF',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  codeLineAccent: {
    color: '#60A5FA',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionButton: {
    flex: 1,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAction: {
    backgroundColor: '#111827',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  primaryActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
