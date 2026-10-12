const fs = require('fs');
const p = 'frontend/src/pages/StudentPage.jsx';
const content = `import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchStudent, fetchMonth } from '../lib/api';
import { Loading, ErrorBox } from '../components/ui';
import { Head } from './sp_head';
import { Charts, MonthBlock, Back } from './sp_tail';

export default function StudentPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState('');
  const [month, setMonth] = useState(null);

  useEffect(() => {
    setData(null); setSel(''); setMonth(null); setErr('');
    fetchStudent(id).then((d) => {
      setData(d);
      if (d.months.length) setSel(d.months[d.months.length - 1].key);
    }).catch((e) => setErr(e.response?.data?.message || e.message));
  }, [id]);
  useEffect(() => {
    if (!sel) return;
    fetchMonth(id, sel).then(setMonth).catch(() => setMonth(null));
  }, [sel, id]);

  if (err) return <ErrorBox message={err} onRetry={() => window.location.reload()} />;
  if (!data) return <Loading label="Loading student..." />;
  const { student, totals } = data;
  const sync = student.leetcode || {};
  return (
    <div>
      <Head student={student} totals={totals} sync={sync} />
      <Charts data={data} />
      <MonthBlock data={data} sel={sel} setSel={setSel} month={month} />
      <Back student={student} />
    </div>
  );
}
`;
fs.writeFileSync(p, content);
console.log('written', content.length);
