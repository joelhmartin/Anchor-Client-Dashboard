import { Box, Typography } from '@mui/material';

export default function AutomationsPane() {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, minHeight: 420 }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        Automations
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Use the board Automations popper from the Boards view to configure rules. This pane can be expanded with dedicated automation flows.
      </Typography>
    </Box>
  );
}

