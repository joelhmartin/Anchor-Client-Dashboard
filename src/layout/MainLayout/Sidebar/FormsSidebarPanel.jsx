import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';

import { IconForms, IconPlus, IconTrash, IconFileText, IconHeartHandshake } from '@tabler/icons-react';

import { fetchForms, createForm, deleteForm } from 'api/forms';
import { useToast } from 'contexts/ToastContext';

export default function FormsSidebarPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [newFormType, setNewFormType] = useState('conversion');
  const [creating, setCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const currentFormId = searchParams.get('form') || '';

  useEffect(() => {
    loadForms();
  }, []);

  const loadForms = async () => {
    try {
      setLoading(true);
      const data = await fetchForms();
      setForms(data.forms || []);
    } catch (err) {
      console.error('Error loading forms:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateForm = async () => {
    if (!newFormName.trim()) return;

    try {
      setCreating(true);
      const data = await createForm({
        name: newFormName.trim(),
        form_type: newFormType
      });

      // Optimistic add so UI updates instantly
      setForms((prev) => [data.form, ...prev]);
      // Close dialog immediately
      setCreateOpen(false);
      // Navigate to builder for new form
      setSearchParams({ pane: 'builder', form: data.form.id });
      toast.success('Form created');

      // Refresh from server to ensure accuracy
      await loadForms();

      // Reset inputs
      setNewFormName('');
      setNewFormType('conversion');
    } catch (err) {
      console.error('Error creating form:', err);
      toast.error('Failed to create form');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteForm = async (formId, e) => {
    e.stopPropagation();
    const form = forms.find((f) => f.id === formId);
    setDeleteTarget(form || { id: formId, name: 'this form' });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteForm(deleteTarget.id);
      // Optimistic remove
      setForms((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      // If we're viewing this form, go home
      if (currentFormId === deleteTarget.id) {
        setSearchParams({ pane: 'home' });
      }
      toast.success('Form deleted');
      // Refresh from server to ensure accuracy
      await loadForms();
    } catch (err) {
      console.error('Error deleting form:', err);
      toast.error('Failed to delete form');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const openBuilderForForm = (formId) => {
    setSearchParams({ pane: 'builder', form: formId });
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconForms size={20} />
          <Typography variant="h6">Forms</Typography>
        </Stack>
      </Stack>

      {/* Forms List */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Forms
        </Typography>
        <IconButton size="small" onClick={() => setCreateOpen(true)}>
          <IconPlus size={16} />
        </IconButton>
      </Stack>

      <List dense>
        {forms.map((form) => {
          const isSelected = currentFormId === form.id;
          return (
            <ListItemButton
              key={form.id}
              selected={isSelected}
              onClick={() => openBuilderForForm(form.id)}
              sx={{ borderRadius: 1, pr: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                {form.form_type === 'intake' ? <IconHeartHandshake size={16} /> : <IconFileText size={16} />}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography
                    variant="body2"
                    component="div"
                    noWrap
                    sx={{
                      fontWeight: isSelected ? 600 : 400
                    }}
                  >
                    {form.name}
                  </Typography>
                }
                secondary={
                  <Box component="span" display="inline-flex" alignItems="center" gap={0.5}>
                    <Chip
                      label={form.status}
                      size="small"
                      sx={{ height: 16, fontSize: 10 }}
                      color={form.status === 'published' ? 'success' : 'default'}
                    />
                  </Box>
                }
                primaryTypographyProps={{ component: 'div', noWrap: true, fontSize: 13 }}
                secondaryTypographyProps={{ component: 'div' }}
              />
              <IconButton size="small" onClick={(e) => handleDeleteForm(form.id, e)} sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}>
                <IconTrash size={14} />
              </IconButton>
            </ListItemButton>
          );
        })}
        {!loading && forms.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 2 }}>
            No forms yet
          </Typography>
        )}
      </List>

      {/* Create Form Dialog */}
      <Dialog open={createOpen} onClose={() => !creating && setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create New Form</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Form Name" value={newFormName} onChange={(e) => setNewFormName(e.target.value)} fullWidth autoFocus />
            <FormControl fullWidth>
              <InputLabel>Form Type</InputLabel>
              <Select value={newFormType} label="Form Type" onChange={(e) => setNewFormType(e.target.value)}>
                <MenuItem value="conversion">Conversion (Non-PHI)</MenuItem>
                <MenuItem value="intake">Intake (PHI)</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              {newFormType === 'intake'
                ? 'Intake forms store PHI securely and never send sensitive data to external services.'
                : 'Conversion forms are for contact forms, lead gen, etc. Data can be sent to CTM.'}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateForm} disabled={!newFormName.trim() || creating}>
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onClose={() => (!deleting && setDeleteDialogOpen(false)) || null} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Form</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="warning">
              Are you sure you want to delete <strong>{deleteTarget?.name || 'this form'}</strong>? This cannot be undone.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
