import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { WebView } from 'react-native-webview';
import { Screen, Button, Skeleton } from '@/components/ui';
import { useMathSolver } from '@/hooks/useMathSolver';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

function MathFormula({ latex, colors }: { latex: string; colors: any }) {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<style>
  body { margin: 0; padding: 8px; background: transparent; font-family: -apple-system, sans-serif; }
  .katex { font-size: 1.1em; }
  .katex-display { margin: 0; }
  .text { color: ${colors.text}; font-size: 14px; line-height: 1.5; }
</style>
</head>
<body>
<div class="text" id="content"></div>
<script>
  try {
    const content = document.getElementById('content');
    const latex = ${JSON.stringify(latex)};
    if (latex.includes('\\\\') || latex.includes('\\\\frac') || latex.includes('\\\\int') || latex.includes('\\\\sum') || latex.includes('$')) {
      const clean = latex.replace(/^\$\$?/, '').replace(/\$\$?$/, '').replace(/\`\`\`latex\n?/g, '').replace(/\`\`\`/g, '');
      katex.render(clean, content, { displayMode: true, throwOnError: false });
    } else {
      content.textContent = latex;
    }
  } catch(e) {
    document.getElementById('content').textContent = ${JSON.stringify(latex)};
  }
</script>
</body>
</html>`;

  return (
    <WebView
      source={{ html }}
      style={{ backgroundColor: 'transparent', height: 60 }}
      scrollEnabled={false}
    />
  );
}

export default function MathSolverScreen() {
  const colors = useThemeColors();
  const { solution, isLoading, error, solve, reset } = useMathSolver();
  const [problem, setProblem] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | undefined>();

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 || undefined);
    }
  }, []);

  const handleTakePhoto = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 || undefined);
    }
  }, []);

  const handleSolve = useCallback(() => {
    if (!problem.trim() && !imageBase64) return;
    const dataUri = imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : undefined;
    // Use resource_id 0 for generic math solving
    solve(0, problem.trim(), dataUri);
  }, [problem, imageBase64, solve]);

  return (
    <Screen safeArea={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xl }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700' }}>
              Math Solver
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
              Type or photograph a math problem
            </Text>
          </View>
        </View>

        {/* Input */}
        <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
          <TextInput
            value={problem}
            onChangeText={setProblem}
            placeholder="e.g. Solve x² - 4 = 0"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={{
              color: colors.text,
              fontSize: FONT_SIZE.md,
              lineHeight: 24,
              minHeight: 80,
              textAlignVertical: 'top',
            }}
          />

          {/* Image preview */}
          {imageUri && (
            <View style={{ marginTop: SPACING.md }}>
              <Image source={{ uri: imageUri }} style={{ width: '100%', height: 150, borderRadius: RADIUS.md }} resizeMode="cover" />
              <TouchableOpacity
                onPress={() => { setImageUri(null); setImageBase64(undefined); }}
                style={{ position: 'absolute', top: SPACING.sm, right: SPACING.sm, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={12} color="#ffffff" />
              </TouchableOpacity>
            </View>
          )}

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: SPACING.md }}>
            <TouchableOpacity onPress={handleTakePhoto} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: colors.muted, borderRadius: RADIUS.full }}>
              <Ionicons name="camera" size={14} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickImage} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: colors.muted, borderRadius: RADIUS.full }}>
              <Ionicons name="image" size={14} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Button
          title="Solve"
          variant="primary"
          onPress={handleSolve}
          loading={isLoading}
          disabled={!problem.trim() && !imageBase64}
        />

        {/* Error */}
        {error && (
          <View style={{ backgroundColor: '#ef4444' + '15', borderRadius: RADIUS.lg, padding: SPACING.lg, marginTop: SPACING.lg, borderWidth: 1, borderColor: '#ef4444' + '30' }}>
            <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.sm }}>{error}</Text>
          </View>
        )}

        {/* Solution */}
        {solution && (
          <View style={{ marginTop: SPACING.xl }}>
            {/* Problem */}
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: 4 }}>PROBLEM</Text>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, lineHeight: 24 }}>{solution.problem}</Text>
            </View>

            {/* Steps */}
            {solution.steps.map((step, i) => (
              <View key={i} style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>{step.label}</Text>
                </View>
                {step.formula ? <MathFormula latex={step.formula} colors={colors} /> : null}
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, lineHeight: 20, marginTop: SPACING.xs }}>{step.explanation}</Text>
              </View>
            ))}

            {/* Final Answer */}
            <View style={{ backgroundColor: colors.primary + '15', borderRadius: RADIUS.lg, padding: SPACING.lg, marginTop: SPACING.md, borderWidth: 2, borderColor: colors.primary + '30' }}>
              <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: 4 }}>FINAL ANSWER</Text>
              <MathFormula latex={solution.final_answer} colors={{ ...colors, text: colors.primary }} />
            </View>

            {/* Key Theorems */}
            {solution.key_theorems.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md }}>
                {solution.key_theorems.map((theorem, i) => (
                  <View key={i} style={{ backgroundColor: colors.accent + '15', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full, borderWidth: 1, borderColor: colors.accent + '30' }}>
                    <Text style={{ color: colors.accent, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>{theorem}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
