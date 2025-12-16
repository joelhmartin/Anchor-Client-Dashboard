import { Box, CircularProgress, Stack, Typography } from '@mui/material';

export default function MyWorkPane({ boards, loading }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minHeight: 420 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Stack spacing={0.25}>
            <Typography variant="h5">My Work</Typography>
            <Typography variant="body2" color="text.secondary">
              Items assigned to you, across all boards.
            </Typography>
          </Stack>
          {loading && <CircularProgress size={18} />}
        </Stack>
        {!loading && !boards.length && (
          <Typography variant="body2" color="text.secondary">
            No assigned items yet.
          </Typography>
        )}
        {boards.map((b) => (
          <Box key={b.board_id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 1.25, bgcolor: 'grey.100', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {b.board_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {b.workspace_name}
              </Typography>
            </Box>
            <Box>
              {(b.items || []).map((it) => (
                <Box key={it.id} sx={{ p: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {it.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {it.status || 'todo'} {it.due_date ? `• due ${it.due_date}` : ''}
                    </Typography>
                  </Stack>
                  {Array.isArray(it.subitems) && it.subitems.length > 0 && (
                    <Box sx={{ pl: 2, mt: 0.5 }}>
                      {it.subitems.slice(0, 6).map((s) => (
                        <Typography key={s.id} variant="caption" color="text.secondary" display="block">
                          - {s.name} ({s.status || 'todo'})
                        </Typography>
                      ))}
                      {it.subitems.length > 6 && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          +{it.subitems.length - 6} more…
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
