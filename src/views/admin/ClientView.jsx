import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import MainCard from 'ui-component/cards/MainCard';
import useAuth from 'hooks/useAuth';
import { fetchClients } from 'api/clients';

export default function ClientView() {
  const { user, initializing, setActingClient, clearActingClient, actingClientId } = useAuth();
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const isAllowed = user?.role === 'admin' || user?.role === 'editor';

  useEffect(() => {
    if (!isAllowed) return;
    setLoading(true);
    fetchClients()
      .then(setClients)
      .catch((err) => setError(err.message || 'Unable to load clients'))
      .finally(() => setLoading(false));
  }, [isAllowed]);

  if (initializing) return null;
  if (!isAllowed) return <Navigate to="/" replace />;

  return (
    <MainCard title="Jump to Client View">
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Select a client to switch into their view without changing your login session.
          </Typography>
          {actingClientId && (
            <Alert severity="info" action={<Button onClick={() => clearActingClient()}>Clear</Button>}>
              Currently viewing client context selected. Use "Clear" to return to your own view.
            </Alert>
          )}
        </Stack>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <List disablePadding>
            {clients.map((c) => (
              <ListItem
                key={c.id}
                secondaryAction={
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setActingClient(c.id);
                      navigate('/portal');
                    }}
                  >
                    Jump to View
                  </Button>
                }
              >
                <ListItemText primary={`${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email} secondary={c.email} />
              </ListItem>
            ))}
            {!clients.length && (
              <ListItem>
                <ListItemText primary="No clients found" />
              </ListItem>
            )}
          </List>
        </Box>
      </Stack>
    </MainCard>
  );
}
