import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { useApp } from '@/providers/AppProvider';
import { Fonts } from '@/constants/fonts';

const GOLD = '#C8894A';

/**
 * Charts the user's periodic "How connected do you feel to God?" answers as a
 * line over their journey. Rendered in the journal's Testify tab.
 */
export default function ConnectionChartCard() {
  const { state } = useApp();

  const checkins = useMemo(
    () =>
      [...(state.connectionCheckins ?? [])].sort(
        (a, b) => a.day - b.day || a.createdAt.localeCompare(b.createdAt)
      ),
    [state.connectionCheckins]
  );

  const width = Math.min(Dimensions.get('window').width - 96, 300);
  const height = 130;
  const pad = 20;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points = checkins.map((c, i) => ({
    x: checkins.length === 1 ? width / 2 : pad + (i * innerW) / (checkins.length - 1),
    y: pad + (5 - c.score) * (innerH / 4),
    day: c.day,
  }));
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  const first = checkins[0];
  const last = checkins[checkins.length - 1];
  const delta = first && last ? last.score - first.score : 0;

  return (
    <View style={styles.card}>
      <Text style={[styles.label, { fontFamily: Fonts.titleBold }]}>YOUR CONNECTION WITH GOD</Text>
      <Text style={[styles.sub, { fontFamily: Fonts.italic }]}>
        How close you've felt, over your journey
      </Text>

      {checkins.length === 0 ? (
        <Text style={[styles.empty, { fontFamily: Fonts.titleLight }]}>
          After a few sessions, TRIAD asks how connected you feel to God. Your
          honest answers are charted here — so you can see change, not guess at it.
        </Text>
      ) : (
        <>
          <View style={styles.chartWrap}>
            <Svg width={width} height={height}>
              {[1, 2, 3, 4].map((i) => (
                <Line
                  key={i}
                  x1={pad}
                  y1={pad + (i * innerH) / 4}
                  x2={width - pad}
                  y2={pad + (i * innerH) / 4}
                  stroke="rgba(200,137,74,0.12)"
                  strokeWidth={1}
                />
              ))}
              {points.length > 1 && (
                <Polyline
                  points={polylinePoints}
                  fill="none"
                  stroke={GOLD}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {points.map((p) => (
                <Circle key={`${p.day}-${p.x}`} cx={p.x} cy={p.y} r={4} fill={GOLD} />
              ))}
            </Svg>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { fontFamily: Fonts.titleLight }]}>
              Day {first.day}
              {checkins.length > 1 ? ` → Day ${last.day}` : ''}
            </Text>
            {checkins.length > 1 && (
              <Text style={[styles.metaDelta, { fontFamily: Fonts.titleMedium }]}>
                {delta > 0
                  ? `+${delta} since Day ${first.day}`
                  : delta < 0
                    ? 'Prayer has dry seasons too'
                    : 'Steady'}
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#171009',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.2)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    letterSpacing: 2.5,
    color: GOLD,
  },
  sub: {
    fontSize: 12.5,
    color: 'rgba(244,237,224,0.6)',
    marginTop: 8,
  },
  chartWrap: {
    marginTop: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  metaText: {
    fontSize: 11,
    color: 'rgba(244,237,224,0.45)',
  },
  metaDelta: {
    fontSize: 11,
    letterSpacing: 0.5,
    color: GOLD,
  },
  empty: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(244,237,224,0.55)',
    textAlign: 'center',
    marginTop: 16,
  },
});
