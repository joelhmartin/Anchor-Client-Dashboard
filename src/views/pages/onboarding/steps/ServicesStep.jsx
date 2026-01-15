import { Alert, Box, Checkbox, FormControlLabel, Grid, IconButton, Paper, Stack, TextField, Typography, Button } from '@mui/material';
import { IconPlus, IconTrash } from '@tabler/icons-react';

const SERVICE_PLACEHOLDER_BY_TYPE = {
  medical: 'e.g., Consultation, Exam, Treatment',
  dental: 'e.g., Teeth Whitening, Root Canal',
  tmj_sleep: 'e.g., Sleep Study, Oral Appliance',
  med_spa: 'e.g., Botox, Laser Treatment',
  chiropractic: 'e.g., Adjustment, Massage Therapy',
  home_service: 'e.g., Repair, Installation, Inspection',
  roofing: 'e.g., Roof Repair, Gutter Install',
  plumbing: 'e.g., Drain Cleaning, Water Heater',
  hvac: 'e.g., AC Repair, Furnace Tune-Up',
  food_service: 'e.g., Catering, Private Event',
  other: 'e.g., Consultation, Service Call'
};

function getPlaceholder(clientType, clientSubtype) {
  // Try subtype first (more specific), then type, then default
  return SERVICE_PLACEHOLDER_BY_TYPE[clientSubtype] || SERVICE_PLACEHOLDER_BY_TYPE[clientType] || 'e.g., Your custom service';
}

export default function ServicesStep({
  defaultOptions,
  isDefaultChecked,
  handleToggleDefaultService,
  customServiceName,
  setCustomServiceName,
  handleCustomServiceKeyDown,
  handleCustomServiceAdd,
  serviceList,
  handleServiceChange,
  handleRemoveService,
  clientType,
  clientSubtype
}) {
  const placeholder = getPlaceholder(clientType, clientSubtype);

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: -0.4 }}>
          Services you offer
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Select the services you offer, this helps you tag and organize leads so you can track them more easily.{' '}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          You can change this later.
        </Typography>
      </Box>

      {defaultOptions.length ? (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Recommended Services
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {defaultOptions.map((option) => (
              <FormControlLabel
                key={option}
                control={
                  <Checkbox checked={isDefaultChecked(option)} onChange={() => handleToggleDefaultService(option)} color="primary" />
                }
                label={option}
              />
            ))}
          </Stack>
        </Paper>
      ) : (
        <Alert severity="info">No preset services configured yet. Add your own below.</Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          fullWidth
          label="Add another service"
          placeholder={placeholder}
          value={customServiceName}
          onChange={(e) => setCustomServiceName(e.target.value)}
          onKeyDown={handleCustomServiceKeyDown}
        />
        <Button
          variant="contained"
          startIcon={<IconPlus />}
          onClick={handleCustomServiceAdd}
          disabled={!customServiceName.trim()}
          sx={{ minWidth: { xs: '100%', sm: 160 } }}
        >
          Add Service
        </Button>
      </Stack>

      {!serviceList.length ? (
        <Alert severity="info">Select or add at least one service to continue.</Alert>
      ) : (
        serviceList.map((service, index) => (
          <Paper key={service.id || `${service.name}-${index}`} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sx={{ flex: 1 }}>
                <TextField
                  label="Service Name"
                  fullWidth
                  value={service.name}
                  onChange={(e) => handleServiceChange(index, 'name', e.target.value)}
                  InputProps={{ readOnly: service.isDefault }}
                  helperText={service.isDefault ? 'Default service from your preset' : ''}
                />
              </Grid>
              <Grid item xs={12} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <IconButton color="error" onClick={() => handleRemoveService(index)}>
                  <IconTrash size={18} />
                </IconButton>
              </Grid>
            </Grid>
          </Paper>
        ))
      )}
    </Stack>
  );
}
