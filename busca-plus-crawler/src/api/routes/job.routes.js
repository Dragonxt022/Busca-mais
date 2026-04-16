const express = require('express');
const router = express.Router();
const { CrawlJob } = require('../../models');
const { Op } = require('sequelize');

// Cancelar job
router.post('/:id/cancel', async (req, res) => {
  try {
    const job = await CrawlJob.findByPk(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job não encontrado' });
    }
    
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return res.status(400).json({ error: 'Job já foi finalizado' });
    }
    
    await job.update({ status: 'cancelled' });
    res.json({ message: 'Job cancelado', job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deletar job
router.delete('/:id', async (req, res) => {
  try {
    const job = await CrawlJob.findByPk(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job não encontrado' });
    }
    
    await job.destroy();
    res.json({ message: 'Job deletado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Limpar jobs concluídos
router.post('/clean-completed', async (req, res) => {
  try {
    const deleted = await CrawlJob.destroy({
      where: {
        status: {
          [Op.in]: ['completed', 'failed', 'cancelled']
        }
      }
    });
    res.json({ deleted, message: `${deleted} jobs removidos` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
