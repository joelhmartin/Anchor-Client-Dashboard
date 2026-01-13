import { Alert, Box, Button, Checkbox, FormControlLabel, Grid, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import { IconPlus, IconTrash } from '@tabler/icons-react';

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
  handleRemoveService
}) {
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: -0.4 }}>
          Services you want to promote
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Select the services that matter most for your website or marketing. This helps us prioritize content and tracking.
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
          placeholder="e.g., Campaign Management"
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
