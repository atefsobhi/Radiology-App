import React, { useState, useEffect } from 'react';
import { ClipboardList, Clock, BarChart3, Users, PieChart as PieChartIcon, LineChart as LineChartIcon, FileText, X } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useNavigate } from '@tanstack/react-router';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface EntryDetail {
  timestamp: string;
  date: string;
  patientId: string;
  patientName: string;
  modality: string;
  description: string;
  status: string;
  accession: string;
  bodyPart: string;
  reportSignedBy: string;
}

interface HourlyData {
  hour: string;
  hour12: string;
  count: number;
  entries: EntryDetail[];
}

type ChartType = 'bar' | 'line' | 'pie';

export default function WorkflowPage() {
  const navigate = useNavigate();
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [timeFormat, setTimeFormat] = useState<'12' | '24'>('24');
  const [selectedModalities, setSelectedModalities] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedSigners, setSelectedSigners] = useState<string[]>([]);
  const [availableModalities, setAvailableModalities] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [availableSigners, setAvailableSigners] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [timeRange, setTimeRange] = useState({ start: '00:00', end: '23:59' });
  const [chartType, setChartType] = useState<ChartType>('line');
  const [showSummary, setShowSummary] = useState(false);

  const CHART_COLORS = ['#4f46e5', '#06b6d4', '#8b5cf6', '#ec4899', '#f97316', '#84cc16', '#14b8a6'];

  useEffect(() => {
    const storedData = localStorage.getItem('radiology_data');
    if (!storedData) {
      navigate({ to: '/' });
      return;
    }

    const rows = JSON.parse(storedData);
    processTimestamps(rows);
  }, [navigate]);

  const clearFilters = () => {
    setSelectedModalities([]);
    setSelectedStatuses([]);
    setSelectedSigners([]);
    setDateRange({ start: '', end: '' });
    setTimeRange({ start: '00:00', end: '23:59' });
  };

  const formatHour = (hour: number, format: '12' | '24'): { hour24: string, hour12: string } => {
    const hour24 = hour.toString().padStart(2, '0');
    let period = hour < 12 ? 'AM' : 'PM';
    let hour12 = hour === 0 ? '12' : hour > 12 ? (hour - 12).toString() : hour.toString();
    hour12 = hour12.padStart(2, '0');
    
    return {
      hour24: `${hour24}:00`,
      hour12: `${hour12}:00 ${period}`
    };
  };

  const extractTimeFromString = (timeStr: string): { hour: number, period: string } | null => {
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!timeMatch) return null;

    let hour = parseInt(timeMatch[1], 10);
    const period = timeMatch[3]?.toUpperCase() || '';

    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    return { hour, period };
  };

  const processTimestamps = (rows: any[]) => {
    const hourData = new Map<number, { count: number; entries: EntryDetail[] }>();
    const modalities = new Set<string>();
    const statuses = new Set<string>();
    const signers = new Set<string>();
    let validEntries = 0;
    
    for (let i = 0; i < 24; i++) {
      hourData.set(i, { count: 0, entries: [] });
    }
    
    rows.forEach(row => {
      try {
        const timeStr = row.Time?.trim();
        if (!timeStr) return;

        const timeInfo = extractTimeFromString(timeStr);
        if (!timeInfo || timeInfo.hour < 0 || timeInfo.hour > 23) return;

        const modality = row['Mod.'] || 'N/A';
        const status = row['Status'] || 'N/A';
        const reportSignedBy = row['Report Signed By'] || '';
        
        modalities.add(modality);
        statuses.add(status);
        if (reportSignedBy) signers.add(reportSignedBy);

        const entryDetail: EntryDetail = {
          date: row.Date || 'N/A',
          timestamp: `${row.Date || 'N/A'} ${timeStr}`,
          patientId: row['Patient ID']?.toString() || 'N/A',
          patientName: row['Patient Name'] || 'N/A',
          modality: modality,
          description: row['Description'] || 'N/A',
          status: status,
          accession: row['Accession'] || 'N/A',
          bodyPart: row['Body Part'] || 'N/A',
          reportSignedBy: reportSignedBy
        };

        const current = hourData.get(timeInfo.hour)!;
        current.count++;
        current.entries.push(entryDetail);
        hourData.set(timeInfo.hour, current);
        validEntries++;
      } catch (e) {
        console.error('Invalid entry:', row, e);
      }
    });

    setAvailableModalities(Array.from(modalities).sort());
    setAvailableStatuses(Array.from(statuses).sort());
    setAvailableSigners(Array.from(signers).sort());
    
    const sortedData = Array.from(hourData.entries())
      .sort(([hourA], [hourB]) => hourA - hourB)
      .map(([hour, data]) => {
        const { hour24, hour12 } = formatHour(hour, timeFormat);
        return {
          hour: hour24,
          hour12: hour12,
          count: data.count,
          entries: data.entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        };
      });

    setHourlyData(sortedData);
    setTotalEntries(validEntries);
  };

  const filteredData = React.useMemo(() => {
    return hourlyData.map(hourData => {
      const [hourNum] = hourData.hour.split(':').map(Number);
      const [startHour] = timeRange.start.split(':').map(Number);
      const [endHour] = timeRange.end.split(':').map(Number);
      const timeRangeMatch = hourNum >= startHour && hourNum <= endHour;

      if (!timeRangeMatch) {
        return {
          ...hourData,
          count: 0,
          entries: []
        };
      }

      const filteredEntries = hourData.entries.filter(entry => {
        const modalityMatch = selectedModalities.length === 0 || selectedModalities.includes(entry.modality);
        const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(entry.status);
        const signerMatch = selectedSigners.length === 0 || (entry.reportSignedBy && selectedSigners.includes(entry.reportSignedBy));
        const dateMatch = (!dateRange.start || !dateRange.end || (entry.date >= dateRange.start && entry.date <= dateRange.end));

        return modalityMatch && statusMatch && signerMatch && dateMatch;
      });

      return {
        ...hourData,
        count: filteredEntries.length,
        entries: filteredEntries
      };
    });
  }, [hourlyData, selectedModalities, selectedStatuses, selectedSigners, timeRange, dateRange]);

  const generateSummaryReport = () => {
    if (filteredData.length === 0) {
      return;
    }

    const modalityCounts = filteredData.reduce((acc, curr) => {
      curr.entries.forEach(entry => {
        acc[entry.modality] = (acc[entry.modality] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    const totalFilteredStudies = filteredData.reduce((sum, curr) => sum + curr.count, 0);
    const peakHour = filteredData.reduce((max, curr) => curr.count > max.count ? curr : max);
    const activeHours = filteredData.filter(data => data.count > 0).length;

    // Export as PDF
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text('Summary Report', 20, 20);
    pdf.setFontSize(12);
    pdf.text(`Generated on ${new Date().toLocaleString()}`, 20, 30);

    // Overview section
    pdf.setFontSize(14);
    pdf.text('Overview', 20, 45);
    pdf.setFontSize(12);
    (pdf as any).autoTable({
      startY: 50,
      head: [['Metric', 'Value']],
      body: [
        ['Total Studies', totalFilteredStudies.toString()],
        ['Active Hours', activeHours.toString()],
        ['Peak Hour', timeFormat === '24' ? peakHour.hour : peakHour.hour12],
        ['Peak Hour Studies', peakHour.count.toString()]
      ]
    });

    // Modality Distribution
    pdf.setFontSize(14);
    pdf.text('Modality Distribution', 20, (pdf as any).lastAutoTable.finalY + 15);
    (pdf as any).autoTable({
      startY: (pdf as any).lastAutoTable.finalY + 20,
      head: [['Modality', 'Count']],
      body: Object.entries(modalityCounts)
    });

    // Applied Filters
    pdf.setFontSize(14);
    pdf.text('Applied Filters', 20, (pdf as any).lastAutoTable.finalY + 15);
    (pdf as any).autoTable({
      startY: (pdf as any).lastAutoTable.finalY + 20,
      head: [['Filter', 'Value']],
      body: [
        ['Date Range', `${dateRange.start || 'All'} to ${dateRange.end || 'All'}`],
        ['Time Range', `${timeRange.start} to ${timeRange.end}`],
        ['Selected Modalities', selectedModalities.join(', ') || 'All'],
        ['Selected Statuses', selectedStatuses.join(', ') || 'All'],
        ['Selected Signers', selectedSigners.join(', ') || 'All']
      ]
    });

    pdf.save('radiology-summary-report.pdf');
  };

  const renderChart = () => {
    switch (chartType) {
      case 'line':
        return (
          <LineChart data={filteredData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey={timeFormat === '24' ? 'hour' : 'hour12'}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis />
            <Tooltip
              formatter={(value: number) => [`${value} studies`, 'Count']}
              labelFormatter={(label: string) => `Hour: ${label}`}
            />
            <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} />
          </LineChart>
        );
      case 'pie':
        const pieData = filteredData.filter(data => data.count > 0);
        return (
          <PieChart>
            <Pie
              data={pieData}
              dataKey="count"
              nameKey={timeFormat === '24' ? 'hour' : 'hour12'}
              cx="50%"
              cy="50%"
              outerRadius={150}
              label={({ name, value }) => `${name}: ${value}`}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        );
      default:
        return (
          <BarChart data={filteredData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey={timeFormat === '24' ? 'hour' : 'hour12'}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis />
            <Tooltip
              formatter={(value: number) => [`${value} studies`, 'Count']}
              labelFormatter={(label: string) => `Hour: ${label}`}
            />
            <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
          </BarChart>
        );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <ClipboardList className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Workflow Management</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3">
            <Clock className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-medium text-gray-900">Total Studies</h2>
          </div>
          <p className="mt-4 text-3xl font-semibold text-gray-900">
            {filteredData.reduce((sum, curr) => sum + curr.count, 0)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-medium text-gray-900">Active Hours</h2>
          </div>
          <p className="mt-4 text-3xl font-semibold text-gray-900">
            {filteredData.filter(data => data.count > 0).length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3">
            <Users className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-medium text-gray-900">Peak Hour</h2>
          </div>
          <p className="mt-4 text-3xl font-semibold text-gray-900">
            {filteredData.length > 0 
              ? (timeFormat === '24'
                ? filteredData.reduce((max, current) => current.count > max.count ? current : max).hour
                : filteredData.reduce((max, current) => current.count > max.count ? current : max).hour12)
              : 'N/A'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
              <div className="flex gap-4">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
              <div className="flex gap-4">
                <input
                  type="time"
                  value={timeRange.start}
                  onChange={(e) => setTimeRange(prev => ({ ...prev, start: e.target.value }))}
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="time"
                  value={timeRange.end}
                  onChange={(e) => setTimeRange(prev => ({ ...prev, end: e.target.value }))}
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Modality Filter</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {availableModalities.map(modality => (
                  <label key={modality} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedModalities.includes(modality)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedModalities(prev => [...prev, modality]);
                        } else {
                          setSelectedModalities(prev => prev.filter(m => m !== modality));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{modality}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status Filter</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {availableStatuses.map(status => (
                  <label key={status} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.includes(status)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStatuses(prev => [...prev, status]);
                        } else {
                          setSelectedStatuses(prev => prev.filter(s => s !== status));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{status}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Report Signer Filter</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {availableSigners.map(signer => (
                  <label key={signer} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedSigners.includes(signer)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSigners(prev => [...prev, signer]);
                        } else {
                          setSelectedSigners(prev => prev.filter(s => s !== signer));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{signer}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-2">
          <div className="flex items-center space-x-2">
            <button
              className={`px-3 py-1 rounded ${timeFormat === '24' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
              onClick={() => setTimeFormat('24')}
            >
              24h
            </button>
            <button
              className={`px-3 py-1 rounded ${timeFormat === '12' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
              onClick={() => setTimeFormat('12')}
            >
              12h
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-2">
          <div className="flex items-center space-x-2">
            <button
              className={`px-3 py-1 rounded flex items-center gap-2 ${chartType === 'line' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
              onClick={() => setChartType('line')}
            >
              <LineChartIcon className="w-4 h-4" /> Line
            </button>
            <button
              className={`px-3 py-1 rounded flex items-center gap-2 ${chartType === 'bar' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
              onClick={() => setChartType('bar')}
            >
              <BarChart3 className="w-4 h-4" /> Bar
            </button>
            <button
              className={`px-3 py-1 rounded flex items-center gap-2 ${chartType === 'pie' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
              onClick={() => setChartType('pie')}
            >
              <PieChartIcon className="w-4 h-4" /> Pie
            </button>
          </div>
        </div>

        <button
          onClick={generateSummaryReport}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <FileText className="w-4 h-4" />
          Export Report
        </button>

        <button
          onClick={clearFilters}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg flex items-center gap-2 hover:bg-gray-700 transition-colors"
        >
          <X className="w-4 h-4" />
          Clear Filters
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <div className="flex items-center space-x-3 mb-6">
          <BarChart3 className="h-6 w-6 text-blue-600" />
          <h2 className="text-lg font-medium text-gray-900">Distribution</h2>
        </div>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Hour ({timeFormat === '24' ? '24h' : '12h'})
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Studies
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredData.map((data, index) => (
              <tr key={index} className={data.count > 0 ? 'bg-gray-50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {timeFormat === '24' ? data.hour : data.hour12}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {data.count}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {data.entries.length > 0 ? (
                    <details>
                      <summary className="cursor-pointer text-blue-600 hover:text-blue-700">
                        View Studies ({data.entries.length})
                      </summary>
                      <div className="mt-2 space-y-3">
                        {data.entries.map((entry, i) => (
                          <div key={i} className="bg-white p-3 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-start">
                              <div className="font-medium text-gray-900">{entry.description || 'No Description'}</div>
                              <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100">
                                {entry.modality}
                              </span>
                            </div>
                            <div className="text-gray-600 text-sm mt-2 space-y-1">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="font-medium">Patient:</span> {entry.patientName}
                                </div>
                                <div>
                                  <span className="font-medium">ID:</span> {entry.patientId}
                                </div>
                                <div>
                                  <span className="font-medium">Time:</span> {entry.timestamp}
                                </div>
                                <div>
                                  <span className="font-medium">Status:</span> {entry.status}
                                </div>
                                {entry.accession && (
                                  <div>
                                    <span className="font-medium">Accession:</span> {entry.accession}
                                  </div>
                                )}
                                {entry.bodyPart && (
                                  <div>
                                    <span className="font-medium">Body Part:</span> {entry.bodyPart}
                                  </div>
                                )}
                                {entry.reportSignedBy && (
                                  <div>
                                    <span className="font-medium">Signed By:</span> {entry.reportSignedBy}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : (
                    'No studies'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
