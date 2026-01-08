import { Stack, TextField, Typography } from '@mui/material';
import FileUploadList from 'ui-component/extended/Form/FileUploadList';

export default function BrandStep({
  token,
  data,
  setData,
  form,
  setForm,
  submitting,
  uploadingLogo,
  setUploadingLogo,
  logoUploadError,
  setLogoUploadError,
  uploadingStyleGuide,
  setUploadingStyleGuide,
  styleGuideUploadError,
  setStyleGuideUploadError,
  removingBrandAssetId,
  setRemovingBrandAssetId,
  uploadBrandAssets,
  deleteBrandAsset,
  onClearMessages,
  toast,
  getErrorMessage
}) {
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Brand Assets</Typography>
      <Typography variant="body2" color="text.secondary">
        Upload logo/style guide files and share your business basics so we can build consistent creative and tracking.
      </Typography>
      <Stack spacing={2}>
        <TextField
          label="Business Name"
          fullWidth
          value={form.brand.business_name || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, business_name: e.target.value } }))}
        />
        <TextField
          label="Business Description"
          fullWidth
          multiline
          minRows={3}
          value={form.brand.business_description || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, business_description: e.target.value } }))}
        />
        <TextField
          label="Website URL"
          fullWidth
          value={form.brand.website_url || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, website_url: e.target.value } }))}
        />
        <TextField
          label="Brand Notes"
          multiline
          minRows={3}
          fullWidth
          value={form.brand.brand_notes || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, brand_notes: e.target.value } }))}
        />
        <Stack spacing={2}>
          <FileUploadList
            title="Logos"
            description="Upload one or more logo files (PNG/JPG/WebP/SVG)."
            accept="image/*"
            multiple
            disabled={submitting}
            busy={uploadingLogo}
            errorText={logoUploadError}
            kindLabel="Logo"
            items={(Array.isArray(data?.brand?.logos) ? data.brand.logos : []).filter((a) => (a?.kind || 'logo') === 'logo')}
            onAddFiles={async (files) => {
              setLogoUploadError('');
              onClearMessages?.();
              setUploadingLogo(true);
              try {
                const res = await uploadBrandAssets(token, files, { kind: 'logo' });
                const next = res?.data?.logos || res?.data?.assets || [];
                setData((prev) => ({ ...prev, brand: { ...(prev?.brand || {}), logos: next } }));
              } catch (err) {
                const msg = getErrorMessage(err, 'Unable to upload logo(s)');
                setLogoUploadError(msg);
                toast.error(msg);
              } finally {
                setUploadingLogo(false);
              }
            }}
            onRemove={async (asset) => {
              setLogoUploadError('');
              onClearMessages?.();
              setRemovingBrandAssetId(asset?.id || '');
              try {
                const next = await deleteBrandAsset(token, asset.id);
                const logos = next?.logos || next?.assets || [];
                setData((prev) => ({ ...prev, brand: { ...(prev?.brand || {}), logos } }));
              } catch (err) {
                const msg = getErrorMessage(err, 'Unable to remove file');
                setLogoUploadError(msg);
                toast.error(msg);
              } finally {
                setRemovingBrandAssetId('');
              }
            }}
          />

          <FileUploadList
            title="Style Guides"
            description="Upload style guides or brand docs (PDF/DOC/DOCX). You can upload multiple."
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            disabled={submitting}
            busy={uploadingStyleGuide}
            errorText={styleGuideUploadError}
            kindLabel="Style Guide"
            items={(Array.isArray(data?.brand?.logos) ? data.brand.logos : []).filter((a) => a?.kind === 'style_guide')}
            onAddFiles={async (files) => {
              setStyleGuideUploadError('');
              onClearMessages?.();
              setUploadingStyleGuide(true);
              try {
                const res = await uploadBrandAssets(token, files, { kind: 'style_guide' });
                const next = res?.data?.logos || res?.data?.assets || [];
                setData((prev) => ({ ...prev, brand: { ...(prev?.brand || {}), logos: next } }));
              } catch (err) {
                const msg = getErrorMessage(err, 'Unable to upload style guide(s)');
                setStyleGuideUploadError(msg);
                toast.error(msg);
              } finally {
                setUploadingStyleGuide(false);
              }
            }}
            onRemove={async (asset) => {
              setStyleGuideUploadError('');
              onClearMessages?.();
              setRemovingBrandAssetId(asset?.id || '');
              try {
                const next = await deleteBrandAsset(token, asset.id);
                const logos = next?.logos || next?.assets || [];
                setData((prev) => ({ ...prev, brand: { ...(prev?.brand || {}), logos } }));
              } catch (err) {
                const msg = getErrorMessage(err, 'Unable to remove file');
                setStyleGuideUploadError(msg);
                toast.error(msg);
              } finally {
                setRemovingBrandAssetId('');
              }
            }}
          />

          <Typography variant="caption" color="text.secondary">
            Tip: Uploaded items appear above. Use the X to remove anything incorrect.
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );
}


