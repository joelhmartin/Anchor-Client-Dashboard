import { Box, Typography } from '@mui/material';

export default function HomePane() {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, minHeight: 420, textAlign: 'center' }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        Task Manager Home
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Use the menu to view boards, My Work, Automations, or Reports.
      </Typography>
    </Box>
  );
}

