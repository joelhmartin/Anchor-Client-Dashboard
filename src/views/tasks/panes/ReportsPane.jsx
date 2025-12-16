import { Box, Button, Checkbox, CircularProgress, Stack, TextField, Typography } from '@mui/material';

export default function ReportsPane({
  reportBoardQuery,
  setReportBoardQuery,
  reportStartInput,
  setReportStartInput,
  reportEndInput,
  setReportEndInput,
  filteredReportBoards,
  selectedReportBoards,
  toggleReportBoard,
  toggleAllReportBoards,
  allBoardsLoading,
  handleRunReport,
  reportLoading,
  reportRows,
  handleExportReportCsv
}) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minHeight: 420 }}>
      <Stack spacing={1.5}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
        >
          <Stack spacing={0.25}>
            <Typography variant="h6">Select boards</Typography>
            <Typography variant="body2" color="text.secondary">
              Choose boards and date range, then run the report.
            </Typography>
          </Stack>
          {reportLoading && <CircularProgress size={18} />}
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            size="small"
            placeholder="Search boards..."
            value={reportBoardQuery}
            onChange={(e) => setReportBoardQuery(e.target.value)}
            sx={{ minWidth: 220 }}
          />
          <TextField
            size="small"
            label="Start"
            type="date"
            value={reportStartInput}
            onChange={(e) => setReportStartInput(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            label="End"
            type="date"
            value={reportEndInput}
            onChange={(e) => setReportEndInput(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            disableElevation
            onClick={handleRunReport}
            disabled={selectedReportBoards.size === 0 || reportLoading}
          >
            {reportLoading ? 'Running…' : 'Run report'}
          </Button>
        </Stack>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          <Box
            sx={{
              p: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'grey.50'
            }}
          >
            <Checkbox
              size="small"
              checked={filteredReportBoards.length > 0 && filteredReportBoards.every((b) => selectedReportBoards.has(b.id))}
              indeterminate={
                filteredReportBoards.some((b) => selectedReportBoards.has(b.id)) &&
                !filteredReportBoards.every((b) => selectedReportBoards.has(b.id))
              }
              onChange={toggleAllReportBoards}
              disabled={allBoardsLoading}
            />
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Boards ({selectedReportBoards.size})
            </Typography>
            {allBoardsLoading && <CircularProgress size={14} />}
          </Box>
          <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
            {filteredReportBoards.map((b) => (
              <Box
                key={b.id}
                sx={{
                  p: 1,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}
              >
                <Checkbox
                  size="small"
                  checked={selectedReportBoards.has(b.id)}
                  onChange={() => toggleReportBoard(b.id)}
                  disabled={allBoardsLoading}
                />
                <Stack sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {b.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {b.workspace_name || ''}
                  </Typography>
                </Stack>
              </Box>
            ))}
            {!filteredReportBoards.length && !allBoardsLoading && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                No boards found.
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'auto' }}>
          <Box sx={{ minWidth: 980 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              justifyContent="space-between"
              sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}
            >
              <Typography variant="subtitle1">Report preview</Typography>
              {reportRows.length > 0 && (
                <Button size="small" variant="outlined" onClick={handleExportReportCsv}>
                  Export to CSV
                </Button>
              )}
            </Stack>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '260px 260px 90px 90px 90px 90px 90px 140px 140px 140px',
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.default'
              }}
            >
              {[
                'Workspace',
                'Board',
                'Total',
                'Todo',
                'Working',
                'Blocked',
                'Done',
                'Updates (range)',
                'Time (min)',
                'Updated (range)'
              ].map((h) => (
                <Box key={h} sx={{ p: 1, fontWeight: 800, fontSize: '0.85rem', borderRight: '1px solid', borderColor: 'divider' }}>
                  {h}
                </Box>
              ))}
            </Box>
            {reportRows.map((r) => (
              <Box
                key={r.board_id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '260px 260px 90px 90px 90px 90px 90px 140px 140px 140px',
                  borderBottom: '1px solid',
                  borderColor: 'divider'
                }}
              >
                <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.workspace_name}</Box>
                <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.board_name}</Box>
                <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.total_items || 0}</Box>
                <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.todo || 0}</Box>
                <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.working || 0}</Box>
                <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.blocked || 0}</Box>
                <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.done || 0}</Box>
                <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.updates_in_range || 0}</Box>
                <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.time_minutes_in_range || 0}</Box>
                <Box sx={{ p: 1 }}>{r.items_updated_in_range || 0}</Box>
              </Box>
            ))}
            {!reportRows.length && !reportLoading && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                Run a report to see preview results.
              </Typography>
            )}
            {reportLoading && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                Running report…
              </Typography>
            )}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
