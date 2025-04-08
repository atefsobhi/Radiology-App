import React, { useState, useCallback, useMemo } from 'react';
import { read, utils, writeFileXLSX } from 'xlsx';
import Papa from 'papaparse';
import * as pdfjsLib from 'pdfjs-dist';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Upload, FileSpreadsheet, FileType, Clock, BarChart3, Users, PieChart as PieChartIcon, LineChart as LineChartIcon, FileText, Download, X } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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

function App() {
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const exportSummaryReport = () => {
    const modalityCounts = filteredData.reduce((acc, curr) => {
      curr.entries.forEach(entry => {
        acc[entry.modality] = (acc[entry.modality] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    const totalFilteredStudies = filteredData.reduce((sum, curr) => sum + curr.count, 0);
    const peakHour = filteredData.reduce((max, curr) => curr.count > max.count ? curr : max);
    const activeHours = filteredData.filter(data => data.count > 0).length;

    // Export as Excel
    const wb = utils.book_new();
    const summaryData = [
      ['Summary Report'],
      ['Generated on', new Date().toLocaleString()],
      [],
      ['Overview'],
      ['Total Studies', totalFilteredStudies],
      ['Active Hours', activeHours],
      ['Peak Hour', timeFormat === '24' ? peakHour.hour : peakHour.hour12],
      ['Peak Hour Studies', peakHour.count],
      [],
      ['Modality Distribution'],
      ['Modality', 'Count'],
      ...Object.entries(modalityCounts).map(([modality, count]) => [modality, count]),
      [],
      ['Applied Filters'],
      ['Date Range', `${dateRange.start || 'All'} to ${dateRange.end || 'All'}`],
      ['Time Range', `${timeRange.start} to ${timeRange.end}`],
      ['Selected Modalities', selectedModalities.join(', ') || 'All'],
      ['Selected Statuses', selectedStatuses.join(', ') || 'All'],
      ['Selected Signers', selectedSigners.join(', ') || 'All']
    ];

    const ws = utils.aoa_to_sheet(summaryData);
    utils.book_append_sheet(wb, ws, 'Summary Report');
    writeFileXLSX(wb, 'radiology-summary-report.xlsx');

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

  const processPdfContent = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const textContent: any[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(' ');
        
        const lines = text.split('\n');
        lines.forEach(line => {
          const parts = line.split(/\s+/);
          if (parts.length >= 6) {
            const timeMatch = parts.find(part => /\d{1,2}:\d{2}\s*(AM|PM)/i.test(part));
            if (timeMatch) {
              textContent.push({
                Date: parts[0],
                Time: timeMatch,
                'Patient ID': parts[1],
                'Patient Name': parts[2],
                'Mod.': parts[3],
                Description: parts[4],
                Status: parts[5],
              });
            }
          }
        });
      }

      processTimestamps(textContent);
    } catch (err) {
      console.error('Error processing PDF:', err);
      setError('Error processing PDF file. Please check the format and try again.');
    }
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    
    try {
      if (file.name.endsWith('.xlsx')) {
        const data = await file.arrayBuffer();
        const workbook = read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = utils.sheet_to_json(worksheet);
        processTimestamps(jsonData);
      } else if (file.name.endsWith('.csv')) {
        const text = await file.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            processTimestamps(results.data);
          }
        });
      } else if (file.name.endsWith('.pdf')) {
        await processPdfContent(file);
      }
    } catch (err) {
      setError('Error processing file. Please check the file format and try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredData = useMemo(() => {
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
    const modalityCounts = filteredData.reduce((acc, curr) => {
      curr.entries.forEach(entry => {
        acc[entry.modality] = (acc[entry.modality] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    const totalFilteredStudies = filteredData.reduce((sum, curr) => sum + curr.count, 0);
    const peakHour = filteredData.reduce((max, curr) => curr.count > max.count ? curr : max);
    const activeHours = filteredData.filter(data => data.count > 0).length;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Summary Report</h2>
            <div className="flex gap-2">
              <button
                onClick={exportSummaryReport}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <button
                onClick={() => setShowSummary(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Overview</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded">
                  <p className="text-sm text-gray-600">Total Studies</p>
                  <p className="text-2xl font-bold">{totalFilteredStudies}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                  <p className="text-sm text-gray-600">Active Hours</p>
                  <p className="text-2xl font-bold">{activeHours}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                  <p className="text-sm text-gray-600">Peak Hour</p>
                  <p className="text-2xl font-bold">{timeFormat === '24' ? peakHour.hour : peakHour.hour12}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                  <p className="text-sm text-gray-600">Peak Hour Studies</p>
                  <p className="text-2xl font-bold">{peakHour.count}</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Modality Distribution</h3>
              <div className="space-y-2">
                {Object.entries(modalityCounts).map(([modality, count]) => (
                  <div key={modality} className="flex items-center">
                    <div className="w-24 font-medium">{modality}</div>
                    <div className="flex-1 mx-2">
                      <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600"
                          style={{
                            width: `${(count / totalFilteredStudies) * 100}%`
                          }}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-right">{count}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Time Range</h3>
              <p>From {timeRange.start} to {timeRange.end}</p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Date Range</h3>
              <p>From {dateRange.start || 'All'} to {dateRange.end || 'All'}</p>
            </div>

            {(selectedModalities.length > 0 || selectedStatuses.length > 0 || selectedSigners.length > 0) && (
              <div>
                <h3 className="text-lg font-semibold mb-2">Applied Filters</h3>
                {selectedModalities.length > 0 && (
                  <div className="mb-2">
                    <h4 className="font-medium mb-1">Modalities:</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedModalities.map(modality => (
                        <span key={modality} className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm">
                          {modality}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedStatuses.length > 0 && (
                  <div className="mb-2">
                    <h4 className="font-medium mb-1">Statuses:</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedStatuses.map(status => (
                        <span key={status} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                          {status}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedSigners.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-1">Report Signers:</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedSigners.map(signer => (
                        <span key={signer} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                          {signer}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
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
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center space-x-3">
            <FileSpreadsheet className="h-8 w-8 text-indigo-600" />
            <h1 className="text-2xl font-semibold text-gray-900">Radiology Data Analysis</h1>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-12 h-12 mb-4 text-gray-500" />
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500">Excel, CSV, or PDF files</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.csv,.pdf"
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center my-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-8">
            {error}
          </div>
        )}

        {hourlyData.length > 0 && !loading && (
          <>
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="bg-white rounded-lg shadow-sm p-2">
                <div className="flex items-center space-x-2">
                  <button
                    className={`px-3 py-1 rounded ${timeFormat === '24' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}
                    onClick={() => setTimeFormat('24')}
                  >
                    24h
                  </button>
                  <button
                    className={`px-3 py-1 rounded ${timeFormat === '12' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}
                    onClick={() => setTimeFormat('12')}
                  >
                    12h
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-2">
                <div className="flex items-center space-x-2">
                  <button
                    className={`px-3 py-1 rounded flex items-center gap-2 ${chartType === 'line' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}
                    onClick={() => setChartType('line')}
                  >
                    <LineChartIcon className="w-4 h-4" /> Line
                  </button>
                  <button
                    className={`px-3 py-1 rounded flex items-center gap-2 ${chartType === 'bar' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}
                    onClick={() => setChartType('bar')}
                  >
                    <BarChart3 className="w-4 h-4" /> Bar
                  </button>
                  <button
                    className={`px-3 py-1 rounded flex items-center gap-2 ${chartType === 'pie' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}
                    onClick={() => setChartType('pie')}
                  >
                    <PieChartIcon className="w-4 h-4" /> Pie
                  </button>
                </div>
              </div>

              <button
                onClick={() => setShowSummary(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors"
              >
                <FileText className="w-4 h-4" />
                Summary Report
              </button>

              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg flex items-center gap-2 hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
                Clear Filters
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2">
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                    <div className="flex gap-4">
                      <input
                        type="date"
                        value={dateRange.start}
                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                        className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      />
                      <span className="text-gray-500">to</span>
                      <input
                        type="date"
                        value={dateRange.end}
                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                        className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
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
                        className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      />
                      <span className="text-gray-500">to</span>
                      <input
                        type="time"
                        value={timeRange.end}
                        onChange={(e) => setTimeRange(prev => ({ ...prev, end: e.target.value }))}
                        className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
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
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
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
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
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
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{signer}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center space-x-3">
                  <FileType className="h-6 w-6 text-indigo-600" />
                  <h2 className="text-lg font-medium text-gray-900">Total Studies</h2>
                </div>
                <p className="mt-4 text-3xl font-semibold text-gray-900">
                  {filteredData.reduce((sum, curr) => sum + curr.count, 0)}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center space-x-3">
                  <Clock className="h-6 w-6 text-indigo-600" />
                  <h2 className="text-lg font-medium text-gray-900">Active Hours</h2>
                </div>
                <p className="mt-4 text-3xl font-semibold text-gray-900">
                  {filteredData.filter(data => data.count > 0).length}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center space-x-3">
                  <Users className="h-6 w-6 text-indigo-600" />
                  <h2 className="text-lg font-medium text-gray-900">Peak Hour</h2>
                </div>
                <p className="mt-4 text-3xl font-semibold text-gray-900">
                  {timeFormat === '24'
                    ? filteredData.reduce((max, current) => current.count > max.count ? current : max).hour
                    : filteredData.reduce((max, current) => current.count > max.count ? current : max).hour12
                  }
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
              <div className="flex items-center space-x-3 mb-6">
                <BarChart3 className="h-6 w-6 text-indigo-600" />
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
                            <summary className="cursor-pointer text-indigo-600 hover:text-indigo-700">
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

            {showSummary && generateSummaryReport()}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
