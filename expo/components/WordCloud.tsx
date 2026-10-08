import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';

interface WordCloudProps {
  textData: string[];
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'i', 'my', 'me', 'we', 'our', 'you', 'your', 'they', 'them',
  'this', 'am', 'do', 'not', 'have', 'but', 'or', 'if', 'what', 'so', 'all',
  'just', 'like', 'about', 'out', 'up', 'down', 'can', 'would', 'could', 'should'
]);

export default function WordCloud({ textData }: WordCloudProps) {
  const C = useColors();
  const T = useTypography();

  const words = useMemo(() => {
    const rawText = textData.join(' ').toLowerCase();
    const tokens = rawText.match(/\b[a-z]{3,}\b/g) || [];
    const counts: Record<string, number> = {};
    for (const token of tokens) {
      if (!STOP_WORDS.has(token)) {
        counts[token] = (counts[token] || 0) + 1;
      }
    }

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    if (sorted.length === 0) return [];

    const maxCount = sorted[0][1];
    
    return sorted.map(([word, count]) => {
      const weight = count / maxCount; // 0 to 1
      const size = T.scale(16 + weight * 24);
      const opacity = 0.5 + weight * 0.5;
      return { word, size, opacity };
    }).sort(() => Math.random() - 0.5); // Randomize positions, but stable roughly
  }, [textData, T]);

  if (words.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: C.textMuted, fontFamily: Fonts.italic }]}>
          Not enough words yet...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {words.map((item, index) => (
        <Animated.Text
          key={`${item.word}-${index}`}
          style={[
            styles.word,
            {
              fontSize: item.size,
              opacity: item.opacity,
              color: index % 2 === 0 ? C.accent : C.text,
              fontFamily: index % 3 === 0 ? Fonts.serifRegular : Fonts.titleMedium,
            }
          ]}
        >
          {item.word}
        </Animated.Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 12,
  },
  word: {
    marginHorizontal: 4,
    marginVertical: 2,
  },
  empty: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  }
});
