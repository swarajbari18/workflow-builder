/** @type {import('../nodeSpecs').NodeSpec} */
const cronSpec = {
  type: 'cron',
  title: 'Schedule Trigger',
  category: 'triggers',
  execution: { kind: 'emit' },
  handles: [{ id: 'tick', kind: 'source', side: 'right', dataType: 'trigger' }],
  fields: [
    { name: 'scheduleType', kind: 'select', label: 'Schedule', options: ['interval', 'cron'], default: 'interval' },
    { name: 'every', kind: 'number', label: 'Every', default: 5, showIf: { scheduleType: 'interval' } },
    { name: 'unit', kind: 'select', label: 'Unit', options: ['minutes', 'hours', 'days'], default: 'minutes', showIf: { scheduleType: 'interval' } },
    { name: 'cron', kind: 'text', label: 'Cron expression', placeholder: '0 9 * * 1-5', showIf: { scheduleType: 'cron' } },
    { name: 'timezone', kind: 'text', label: 'Timezone', default: 'UTC', advanced: true },
  ],
};

export default cronSpec;
