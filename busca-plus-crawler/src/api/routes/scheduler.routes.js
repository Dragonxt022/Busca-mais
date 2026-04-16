const express = require('express');
const router = express.Router();
const { Source } = require('../../models');
const scheduler = require('../../libs/scheduler');
const { discoverQueue, crawlQueue } = require('../../libs/queue');
const { logger } = require('../../libs/logger');

router.get('/scheduled', async (req, res) => {
  try {
    const sources = await scheduler.getScheduledSources();
    res.json({ success: true, data: sources });
  } catch (error) {
    logger.error('Failed to get scheduled sources:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/sources/:id/schedule', async (req, res) => {
  try {
    const { id } = req.params;
    const { schedule } = req.body;

    const source = await Source.findByPk(id);
    if (!source) {
      return res.status(404).json({ success: false, error: 'Source not found' });
    }

    if (schedule) {
      const cronPattern = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
      if (!cronPattern.test(schedule)) {
        return res.status(400).json({ success: false, error: 'Invalid cron expression' });
      }
    }

    await Source.update({ schedule }, { where: { id } });
    await scheduler.syncScheduledJobs();

    res.json({ success: true, message: 'Schedule updated' });
  } catch (error) {
    logger.error('Failed to set schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/sources/:id/schedule', async (req, res) => {
  try {
    const { id } = req.params;

    const source = await Source.findByPk(id);
    if (!source) {
      return res.status(404).json({ success: false, error: 'Source not found' });
    }

    await Source.update({ schedule: null }, { where: { id } });
    await scheduler.removeScheduledJob(`source-${id}`);

    res.json({ success: true, message: 'Schedule removed' });
  } catch (error) {
    logger.error('Failed to remove schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/trigger/:sourceId', async (req, res) => {
  try {
    const { sourceId } = req.params;
    const source = await Source.findByPk(sourceId);

    if (!source) {
      return res.status(404).json({ success: false, error: 'Source not found' });
    }

    await discoverQueue.add('discover-pages', {
      sourceId: source.id,
      startUrl: source.base_url,
      maxPages: source.crawl_depth * 50,
    });

    res.json({ success: true, message: 'Crawl triggered' });
  } catch (error) {
    logger.error('Failed to trigger crawl:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/repeatable', async (req, res) => {
  try {
    const discoverJobs = await discoverQueue.getRepeatableJobs();
    const crawlJobs = await crawlQueue.getRepeatableJobs();

    res.json({
      success: true,
      data: {
        discover: discoverJobs.map(j => ({
          name: j.name,
          key: j.key,
          nextRun: new Date(j.nextMillis),
          pattern: j.pattern,
        })),
        crawl: crawlJobs.map(j => ({
          name: j.name,
          key: j.key,
          nextRun: new Date(j.nextMillis),
          pattern: j.pattern,
        })),
      },
    });
  } catch (error) {
    logger.error('Failed to get repeatable jobs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
