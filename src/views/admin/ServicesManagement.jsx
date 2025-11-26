import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { IconEdit, IconTrash, IconPlus } from '@tabler/icons-react';

import MainCard from 'ui-component/cards/MainCard';
import { fetchServices, createService, updateService, deleteService } from 'api/services';

export default function ServicesManagement() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', base_price: '', active: true });

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchServices();
      setServices(data);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Unable to load services' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const handleOpenDialog = (service = null) => {
    if (service) {
      setEditingService(service);
      setFormData({
        name: service.name || '',
        description: service.description || '',
        base_price: service.base_price || '',
        active: service.active !== false
      });
    } else {
      setEditingService(null);
      setFormData({ name: '', description: '', base_price: '', active: true });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingService(null);
    setFormData({ name: '', description: '', base_price: '', active: true });
  };

  const handleSave = async () => {
    if (!formData.name) {
      setMessage({ type: 'error', text: 'Service name is required' });
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: formData.name,
        description: formData.description,
        base_price: formData.base_price ? parseFloat(formData.base_price) : null,
        active: formData.active
      };

      if (editingService) {
        await updateService(editingService.id, payload);
        setMessage({ type: 'success', text: 'Service updated successfully' });
      } else {
        await createService(payload);
        setMessage({ type: 'success', text: 'Service created successfully' });
      }

      handleCloseDialog();
      await loadServices();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Unable to save service' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this service?')) {
      return;
    }

    try {
      setLoading(true);
      await deleteService(id);
      setMessage({ type: 'success', text: 'Service deleted successfully' });
      await loadServices();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Unable to delete service' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainCard
      title="My Services"
      secondary={
        <Button variant="contained" startIcon={<IconPlus />} onClick={() => handleOpenDialog()}>
          Add Service
        </Button>
      }
    >
      <Stack spacing={3}>
        {message.text && <Alert severity={message.type === 'error' ? 'error' : 'success'}>{message.text}</Alert>}

        {loading && !services.length && <LinearProgress />}

        {services.length === 0 && !loading ? (
          <Typography variant="body2" color="text.secondary">
            No services configured yet.
          </Typography>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Base Price</TableCell>
                  <TableCell align="center">Active</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {services.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell>
                      <Typography variant="subtitle2">{service.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {service.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {service.base_price ? `$${parseFloat(service.base_price).toFixed(2)}` : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Switch checked={service.active !== false} disabled size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <IconButton size="small" onClick={() => handleOpenDialog(service)}>
                          <IconEdit />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(service.id)}>
                          <IconTrash />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>

      {/* Service Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingService ? 'Edit Service' : 'Add Service'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Service Name"
              fullWidth
              required
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            />
            <TextField
              label="Base Price"
              fullWidth
              type="number"
              inputProps={{ step: '0.01', min: '0' }}
              value={formData.base_price}
              onChange={(e) => setFormData((prev) => ({ ...prev, base_price: e.target.value }))}
            />
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography>Active</Typography>
              <Switch checked={formData.active} onChange={(e) => setFormData((prev) => ({ ...prev, active: e.target.checked }))} />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={loading}>
            {editingService ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </MainCard>
  );
}

