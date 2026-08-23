import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useThemeColors } from '@/hooks/useTheme';
import { useUploadResource } from '@/hooks/useResources';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

interface UploadSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function UploadSheet({ visible, onClose }: UploadSheetProps) {
  const colors = useThemeColors();
  const uploadMutation = useUploadResource();
  const [mode, setMode] = useState<'menu' | 'url'>('menu');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const reset = () => {
    setMode('menu');
    setUrl('');
    setTitle('');
    setUploadProgress(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.name || 'document',
        type: asset.mimeType || 'application/octet-stream',
      } as any);
      if (title.trim()) formData.append('title', title.trim());

      uploadMutation.mutate(
        { formData, onProgress: setUploadProgress },
        {
          onSuccess: handleClose,
          onError: () => {},
        }
      );
    } catch {
      // User cancelled or error
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'image.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);
      if (title.trim()) formData.append('title', title.trim());

      uploadMutation.mutate(
        { formData, onProgress: setUploadProgress },
        {
          onSuccess: handleClose,
          onError: () => {},
        }
      );
    } catch {
      // User cancelled
    }
  };

  const handleTakePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'photo.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);

      uploadMutation.mutate(
        { formData, onProgress: setUploadProgress },
        {
          onSuccess: handleClose,
          onError: () => {},
        }
      );
    } catch {
      // User cancelled
    }
  };

  const handleSubmitUrl = () => {
    if (!url.trim()) return;
    const formData = new FormData();
    formData.append('url', url.trim());
    if (title.trim()) formData.append('title', title.trim());

    uploadMutation.mutate(
      { formData, onProgress: setUploadProgress },
      {
        onSuccess: handleClose,
        onError: () => {},
      }
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ backgroundColor: colors.elevatedBackground, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: SPACING.lg, paddingBottom: SPACING.xxxl, maxHeight: '80%' }}>
          {/* Handle bar */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: SPACING.lg }} />

          <View style={{ paddingHorizontal: SPACING.xl }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800', marginBottom: SPACING.xs }}>
              Upload Resource
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, marginBottom: SPACING.xl }}>
              Add study materials to your library
            </Text>

            {mode === 'url' ? (
              /* ── URL INPUT MODE ── */
              <View>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Title (optional)"
                  placeholderTextColor={colors.textSecondary}
                  style={{ backgroundColor: colors.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: FONT_SIZE.md, padding: SPACING.md, marginBottom: SPACING.md }}
                />
                <TextInput
                  value={url}
                  onChangeText={setUrl}
                  placeholder="Paste YouTube or article URL"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={{ backgroundColor: colors.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: FONT_SIZE.md, padding: SPACING.md, marginBottom: SPACING.lg }}
                />
                {uploadMutation.isPending && (
                  <View style={{ marginBottom: SPACING.lg }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs }}>
                      <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Uploading...</Text>
                      <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>{uploadProgress}%</Text>
                    </View>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.muted, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${uploadProgress}%`, borderRadius: 2, backgroundColor: colors.primary }} />
                    </View>
                  </View>
                )}
                <TouchableOpacity
                  onPress={handleSubmitUrl}
                  disabled={!url.trim() || uploadMutation.isPending}
                  style={{ backgroundColor: colors.primary, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', opacity: url.trim() && !uploadMutation.isPending ? 1 : 0.5 }}
                >
                  {uploadMutation.isPending ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={{ color: '#ffffff', fontSize: FONT_SIZE.md, fontWeight: '700' }}>Generate Study Kit</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMode('menu')} style={{ padding: SPACING.md, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>Back</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* ── MENU MODE ── */
              <View>
                {uploadMutation.isPending && (
                  <View style={{ marginBottom: SPACING.lg }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs }}>
                      <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Uploading...</Text>
                      <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>{uploadProgress}%</Text>
                    </View>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.muted, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${uploadProgress}%`, borderRadius: 2, backgroundColor: colors.primary }} />
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  onPress={handlePickDocument}
                  disabled={uploadMutation.isPending}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: colors.border, gap: SPACING.md, opacity: uploadMutation.isPending ? 0.5 : 1 }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#ef4444' + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="document-text" size={20} color="#ef4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>Choose Document</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>PDF, DOCX, PPTX, TXT, code files</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handlePickImage}
                  disabled={uploadMutation.isPending}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: colors.border, gap: SPACING.md, opacity: uploadMutation.isPending ? 0.5 : 1 }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#8b5cf6' + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="image" size={20} color="#8b5cf6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>Choose Image</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>JPG, PNG from gallery</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                {Platform.OS !== 'web' && (
                  <TouchableOpacity
                    onPress={handleTakePhoto}
                    disabled={uploadMutation.isPending}
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: colors.border, gap: SPACING.md, opacity: uploadMutation.isPending ? 0.5 : 1 }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#06b6d4' + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="camera" size={20} color="#06b6d4" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>Take Photo</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Capture a page or whiteboard</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => setMode('url')}
                  disabled={uploadMutation.isPending}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border, gap: SPACING.md, opacity: uploadMutation.isPending ? 0.5 : 1 }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#22c55e' + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="link" size={20} color="#22c55e" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>Paste Link</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>YouTube video or web article</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {uploadMutation.isError && (
              <View style={{ marginTop: SPACING.md, backgroundColor: colors.error + '15', borderRadius: RADIUS.md, padding: SPACING.md }}>
                <Text style={{ color: colors.error, fontSize: FONT_SIZE.sm }}>
                  Upload failed. Please try again.
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
