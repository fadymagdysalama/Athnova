import { create } from 'zustand';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';

export interface CoachDocument {
  id: string;
  coach_id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string;
  created_at: string;
  assignments?: { client_id: string | null }[];
}

interface DocumentState {
  documents: CoachDocument[];
  clientDocuments: CoachDocument[];
  isLoading: boolean;
  uploading: boolean;

  fetchMyDocuments: () => Promise<void>;
  fetchClientDocuments: (coachId: string, clientId: string) => Promise<void>;
  pickAndUpload: (
    title: string,
    description: string,
    visibleToAll: boolean,
    clientIds: string[],
  ) => Promise<{ error: string | null }>;
  deleteDocument: (doc: CoachDocument) => Promise<{ error: string | null }>;
  assignToAll: (docId: string) => Promise<{ error: string | null }>;
  assignToClient: (docId: string, clientId: string) => Promise<{ error: string | null }>;
  unassignClient: (docId: string, clientId: string) => Promise<{ error: string | null }>;
  openDocument: (doc: CoachDocument, coachId: string) => Promise<void>;
  previewDocument: (doc: CoachDocument) => Promise<void>;
}

const CACHE_DIR = `${FileSystem.documentDirectory}coachero_docs/`;

async function ensureCacheDir() {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  clientDocuments: [],
  isLoading: false,
  uploading: false,

  fetchMyDocuments: async () => {
    if (!get().documents.length) set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const { data } = await supabase
      .from('coach_documents')
      .select('*, assignments:coach_document_assignments(client_id)')
      .eq('coach_id', user.id)
      .order('created_at', { ascending: false });

    set({ documents: (data as CoachDocument[]) ?? [], isLoading: false });
  },

  fetchClientDocuments: async (coachId: string, clientId: string) => {
    set({ isLoading: true });

    // First get the document IDs assigned to this client (or all clients)
    // RLS on coach_document_assignments already filters to client_id = auth.uid() OR client_id IS NULL
    const { data: assignments } = await supabase
      .from('coach_document_assignments')
      .select('document_id');

    if (!assignments?.length) return set({ clientDocuments: [], isLoading: false });

    const docIds = [...new Set(assignments.map((a: any) => a.document_id))];

    // Now fetch the actual documents for this coach that matched
    const { data } = await supabase
      .from('coach_documents')
      .select('*')
      .eq('coach_id', coachId)
      .in('id', docIds)
      .order('created_at', { ascending: false });

    set({
      clientDocuments: (data ?? []) as CoachDocument[],
      isLoading: false,
    });
  },

  pickAndUpload: async (title, description, visibleToAll, clientIds) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    // Pick file
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) return { error: null };

    const asset = result.assets[0];
    set({ uploading: true });

    // Upload to Supabase Storage
    const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const fileExt = asset.name.split('.').pop() ?? 'pdf';
    const storagePath = `coaches/${user.id}/${docId}/${asset.name}`;

    const fileContent = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { error: uploadErr } = await supabase.storage
      .from('coach-documents')
      .upload(storagePath, decode(fileContent), {
        contentType: asset.mimeType ?? 'application/pdf',
        upsert: false,
      });

    if (uploadErr) {
      set({ uploading: false });
      return { error: uploadErr.message };
    }

    // Insert metadata row
    const { data: docRow, error: insertErr } = await supabase
      .from('coach_documents')
      .insert({
        coach_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        file_path: storagePath,
        file_name: asset.name,
        file_size: asset.size ?? null,
        mime_type: asset.mimeType ?? 'application/pdf',
      })
      .select()
      .single();

    if (insertErr || !docRow) {
      set({ uploading: false });
      return { error: insertErr?.message ?? 'Failed to save document' };
    }

    // Create assignments
    if (visibleToAll) {
      await supabase.from('coach_document_assignments').insert({
        document_id: docRow.id,
        client_id: null,
      });
    } else {
      const rows = clientIds.map((cid) => ({ document_id: docRow.id, client_id: cid }));
      if (rows.length > 0) {
        await supabase.from('coach_document_assignments').insert(rows);
      }
    }

    set({ uploading: false });
    await get().fetchMyDocuments();
    return { error: null };
  },

  deleteDocument: async (doc) => {
    await supabase.storage.from('coach-documents').remove([doc.file_path]);
    const { error } = await supabase.from('coach_documents').delete().eq('id', doc.id);
    if (error) return { error: error.message };
    // Remove local cache if present
    const localPath = CACHE_DIR + doc.id + '_' + doc.file_name;
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) await FileSystem.deleteAsync(localPath);
    await get().fetchMyDocuments();
    return { error: null };
  },

  assignToAll: async (docId) => {
    // Remove specific assignments and add null (all)
    await supabase.from('coach_document_assignments').delete().eq('document_id', docId);
    const { error } = await supabase.from('coach_document_assignments').insert({ document_id: docId, client_id: null });
    if (error) return { error: error.message };
    await get().fetchMyDocuments();
    return { error: null };
  },

  assignToClient: async (docId, clientId) => {
    // Remove the "all" assignment if present
    await supabase.from('coach_document_assignments').delete().eq('document_id', docId).is('client_id', null);
    const { error } = await supabase.from('coach_document_assignments').insert({ document_id: docId, client_id: clientId });
    if (error && error.code !== '23505') return { error: error.message };
    await get().fetchMyDocuments();
    return { error: null };
  },

  unassignClient: async (docId, clientId) => {
    const { error } = await supabase.from('coach_document_assignments').delete()
      .eq('document_id', docId).eq('client_id', clientId);
    if (error) return { error: error.message };
    await get().fetchMyDocuments();
    return { error: null };
  },

  openDocument: async (doc, coachId) => {
    await ensureCacheDir();
    const localPath = CACHE_DIR + doc.id + '_' + doc.file_name;
    const info = await FileSystem.getInfoAsync(localPath);

    if (!info.exists) {
      // Download from Supabase signed URL
      const { data: urlData } = await supabase.storage
        .from('coach-documents')
        .createSignedUrl(doc.file_path, 3600);

      if (!urlData?.signedUrl) return;

      await FileSystem.downloadAsync(urlData.signedUrl, localPath);
    }

    // Share / save to device
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(localPath, {
        mimeType: doc.mime_type,
        dialogTitle: doc.title,
        UTI: doc.mime_type === 'application/pdf' ? 'com.adobe.pdf' : undefined,
      });
    }
  },

  previewDocument: async (doc) => {
    // Get a short-lived signed URL and open in the in-app browser
    // No local download required — browser handles streaming
    const { data: urlData } = await supabase.storage
      .from('coach-documents')
      .createSignedUrl(doc.file_path, 3600);

    if (!urlData?.signedUrl) return;

    await WebBrowser.openBrowserAsync(urlData.signedUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  },
}));

// Helper: decode base64 to Uint8Array for Supabase upload
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
