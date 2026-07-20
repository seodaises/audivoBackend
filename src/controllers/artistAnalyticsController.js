'use strict';
const artistAnalyticsService = require('../services/artistAnalyticsService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// GET /api/artists/analytics/tracks?range=30d|all
const myTrackPerformance = catchAsync(async (req, res) => {
  const result = await artistAnalyticsService.myTrackPerformance({
    userId: req.user.id,
    range: req.query.range === 'all' ? 'all' : '30d',
  });
  return success(res, 200, 'Track performance retrieved', result);
});

module.exports = { myTrackPerformance };