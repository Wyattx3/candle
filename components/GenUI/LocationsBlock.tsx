/**
 * LocationsBlock — an inline GenUI maps & locations view rendered in the chat
 * stream. Mirrors the Pencil `Screen · Chat · Locations` ReportWrap and the
 * `GenUI/8 · Maps & Location Views` cells: a rounded map-placeholder card
 * (warm canvas, faint grid streets, a curved road, a few flame pins) carrying
 * an info footer, followed by a vertical list of location cards (storefront
 * icon, name, address, distance, and an open/closed pill). Map art is drawn
 * with `react-native-svg`. Pure presentational; falls back to SAMPLE data when
 * `data` is missing or malformed.
 */
import { MapPin, Store } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface Place {
  name: string;
  address: string;
  distance: string;
  hours?: string;
  open: boolean;
  /** Pin position on the map, fractional 0..1. */
  pin: { x: number; y: number };
}

interface LocationsData {
  title: string;
  subtitle: string;
  nearest: string;
  places: Place[];
}

const SAMPLE: LocationsData = {
  title: '3 stores nearby',
  subtitle: 'Within 5 km',
  nearest: '0.8 km',
  places: [
    {
      name: 'Marina Branch',
      address: '8 Marina Blvd',
      distance: '1.2 km',
      hours: 'Open · until 9 PM',
      open: true,
      pin: { x: 0.2, y: 0.34 },
    },
    {
      name: 'Orchard Store',
      address: '290 Orchard Rd',
      distance: '2.6 km',
      hours: 'Open · until 10 PM',
      open: true,
      pin: { x: 0.52, y: 0.64 },
    },
    {
      name: 'Sentosa Kiosk',
      address: '1 Sentosa Gateway',
      distance: '5.4 km',
      hours: 'Closed · opens 10 AM',
      open: false,
      pin: { x: 0.76, y: 0.42 },
    },
  ],
};

function clamp01(n: number): number {
  if (!isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Coerce an unknown payload into safe LocationsData. */
function normalize(data: unknown): LocationsData {
  if (!data || typeof data !== 'object') return SAMPLE;
  const d = data as Record<string, unknown>;
  const places = Array.isArray(d.places)
    ? (d.places as unknown[])
        .map((p, i): Place | null => {
          const r = p as Record<string, unknown>;
          if (!r || typeof r !== 'object' || typeof r.name !== 'string') return null;
          const pinRaw = (r.pin ?? {}) as Record<string, unknown>;
          return {
            name: r.name,
            address: typeof r.address === 'string' ? r.address : '',
            distance: typeof r.distance === 'string' ? r.distance : '',
            hours: typeof r.hours === 'string' ? r.hours : undefined,
            open: typeof r.open === 'boolean' ? r.open : true,
            pin: {
              x: clamp01(typeof pinRaw.x === 'number' ? pinRaw.x : (i + 1) / 5),
              y: clamp01(typeof pinRaw.y === 'number' ? pinRaw.y : 0.4 + (i % 3) * 0.12),
            },
          };
        })
        .filter((p): p is Place => p !== null)
    : [];
  const resolved = places.length > 0 ? places : SAMPLE.places;
  return {
    title: typeof d.title === 'string' ? d.title : `${resolved.length} locations`,
    subtitle: typeof d.subtitle === 'string' ? d.subtitle : SAMPLE.subtitle,
    nearest: typeof d.nearest === 'string' ? d.nearest : resolved[0]?.distance ?? '',
    places: resolved,
  };
}

const MAP_W = 300;
const MAP_H = 150;

function MapArt() {
  const grid = '#D8CBB6';
  return (
    <Svg
      width="100%"
      height={MAP_H}
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      preserveAspectRatio="xMidYMid slice"
    >
      {/* horizontal streets */}
      {[30, 62, 94, 126].map((y) => (
        <Line key={`r${y}`} x1={-20} y1={y} x2={MAP_W} y2={y} stroke={grid} strokeWidth={2} />
      ))}
      {/* vertical streets */}
      {[30, 90, 150, 210, 270].map((x) => (
        <Line key={`c${x}`} x1={x} y1={-10} x2={x} y2={MAP_H + 10} stroke={grid} strokeWidth={2} />
      ))}
      {/* curved main road */}
      <Path
        d="M0 120 C 70 120 90 60 150 60 S 250 30 300 36"
        stroke="#C9B896"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function Pin({ place }: { place: Place }) {
  const left: `${number}%` = `${Number((place.pin.x * 100).toFixed(2))}%`;
  const top: `${number}%` = `${Number((place.pin.y * 100).toFixed(2))}%`;
  return (
    <View style={[styles.pin, { left, top }]}>
      <Store size={13} color={Candle.textOnInk} />
    </View>
  );
}

function PlaceCard({ place }: { place: Place }) {
  return (
    <View style={styles.placeCard}>
      <View style={styles.placeIcon}>
        <Store size={20} color={Candle.flame} />
      </View>
      <View style={styles.placeCol}>
        <Text style={styles.placeName} numberOfLines={1}>
          {place.name}
        </Text>
        <View style={styles.addrRow}>
          <MapPin size={13} color={Candle.textTertiary} />
          <Text style={styles.addr} numberOfLines={1}>
            {place.address}
          </Text>
        </View>
        {place.hours ? (
          <Text style={styles.hours} numberOfLines={1}>
            {place.hours}
          </Text>
        ) : null}
      </View>
      <View style={styles.placeMeta}>
        <Text style={styles.distance}>{place.distance}</Text>
        <View
          style={[
            styles.badge,
            { backgroundColor: place.open ? Candle.successSoft : Candle.surfaceSunken },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: place.open ? Candle.success : Candle.textTertiary },
            ]}
          >
            {place.open ? 'Open' : 'Closed'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function LocationsBlock({ data }: { data?: unknown }) {
  const model = useMemo(() => normalize(data), [data]);
  return (
    <View style={styles.root}>
      {/* Map placeholder */}
      <View style={styles.mapCard}>
        <View style={styles.map}>
          <MapArt />
          {model.places.map((place, i) => (
            <Pin key={i} place={place} />
          ))}
        </View>
        <View style={styles.info}>
          <Store size={18} color={Candle.flame} />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle} numberOfLines={1}>
              {model.title}
            </Text>
            <Text style={styles.infoSub} numberOfLines={1}>
              {model.subtitle}
            </Text>
          </View>
          <Text style={styles.infoDistance}>{model.nearest}</Text>
        </View>
      </View>

      {/* Location list */}
      <View style={styles.list}>
        {model.places.map((place, i) => (
          <PlaceCard key={i} place={place} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
    width: '100%',
  },
  mapCard: {
    borderRadius: 16,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    overflow: 'hidden',
  },
  map: {
    height: 150,
    backgroundColor: Candle.bgCanvas,
  },
  pin: {
    position: 'absolute',
    width: 26,
    height: 26,
    marginLeft: -13,
    marginTop: -13,
    borderRadius: 13,
    backgroundColor: Candle.flame,
    borderWidth: 2,
    borderColor: '#FFFDF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  infoText: {
    flex: 1,
    gap: 1,
  },
  infoTitle: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  infoSub: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11,
    color: Candle.textTertiary,
  },
  infoDistance: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: Candle.flame,
  },
  list: {
    gap: 12,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    padding: 13,
  },
  placeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Candle.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeCol: {
    flex: 1,
    gap: 3,
  },
  placeName: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  addr: {
    flex: 1,
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11.5,
    color: Candle.textSecondary,
  },
  hours: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11,
    color: Candle.textTertiary,
  },
  placeMeta: {
    alignItems: 'flex-end',
    gap: 5,
  },
  distance: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 12.5,
    fontWeight: '600',
    color: Candle.flame,
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  badgeText: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 10.5,
    fontWeight: '600',
  },
});
