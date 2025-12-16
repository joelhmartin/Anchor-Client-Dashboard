import { Box, Typography } from '@mui/material';

export default function BillingPane() {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, minHeight: 420 }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        Billing
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Billing content coming soon.
      </Typography>
    </Box>
  );
}
