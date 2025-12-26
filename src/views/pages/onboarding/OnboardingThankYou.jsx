import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';

const CALENDAR_LINK = 'https://calendar.app.google/zgRn9gFuVizsnMmM9';
const BG_VIDEO_URL =
  'https://player.vimeo.com/progressive_redirect/playback/1148954813/rendition/540p/file.mp4%20%28540p%29.mp4?loc=external&signature=99d25378d09a6808196c03b527b18b831e2033dd4eb581fc26098bdfcbd67f9b';

export default function OnboardingThankYou() {
  const location = useLocation();
  const email = location.state?.email || '';
  const [videoEnded, setVideoEnded] = useState(false);
  const bgVideoUrl = useMemo(() => BG_VIDEO_URL, []);

  return (
    <Box sx={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', bgcolor: '#0b1020' }}>
      {bgVideoUrl ? (
        <Box
          component="video"
          autoPlay
          muted
          playsInline
          src={bgVideoUrl}
          onEnded={() => setVideoEnded(true)}
          sx={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            objectFit: 'cover',
            zIndex: 0,
            filter: 'saturate(1.05) contrast(1.05)',
            opacity: videoEnded ? 0.75 : 1
          }}
        />
      ) : null}

      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          background:
            'radial-gradient(1200px 800px at 20% 10%, rgba(102,126,234,0.35) 0%, rgba(11,16,32,0.0) 60%), linear-gradient(180deg, rgba(11,16,32,0.55) 0%, rgba(11,16,32,0.75) 100%)'
        }}
      />

      <Container
        maxWidth="sm"
        sx={{
          position: 'relative',
          zIndex: 2,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          py: { xs: 6, md: 10 }
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            p: { xs: 3, md: 4 },
            borderRadius: 3,
            bgcolor: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.55)'
          }}
        >
          <Stack spacing={2.25}>
            <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: -0.6 }}>
              Thank you for completing your onboarding
            </Typography>
            <Typography variant="body1" color="text.secondary">
              We appreciate you taking the time to share these details. Your onboarding form has been received, and your account is ready
              for the next steps.
            </Typography>

            <Typography variant="body2" color="text.secondary">
              You can log in anytime to review your dashboard{email ? ` (${email})` : ''}.
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ pt: 1 }}>
              <Button
                component={RouterLink}
                to="/pages/login"
                state={email ? { email } : undefined}
                variant="outlined"
                size="large"
                fullWidth
              >
                Go to Login
              </Button>
              <Button
                component="a"
                href={CALENDAR_LINK}
                target="_blank"
                rel="noopener noreferrer"
                variant="contained"
                size="large"
                fullWidth
              >
                Schedule a meeting with your Account Manager
              </Button>
            </Stack>

            <Typography variant="caption" color="text.secondary">
              If you have any questions, reply to your onboarding email or reach out to your account manager directly.
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
