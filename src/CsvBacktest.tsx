import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import { Input } from "./components/ui/input.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  BarElement,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Slider } from "./components/ui/slider";
import { ModeToggle } from "./components/ui/mode-toggle.tsx";
import { Card, CardHeader, CardTitle, CardContent } from "./components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Button } from "./components/ui/button.tsx";
import { Minus, Plus } from "lucide-react";


ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  ChartLegend,
  BarElement
);

const getCssVariable = (variableName: string) => {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
};

function calculateSMA(data: number[], span: number): number[] {
  const smaArr: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < span - 1) {
      smaArr.push(NaN);
    } else {
      const sum = data.slice(i - span + 1, i + 1).reduce((acc, val) => acc + val, 0);
      smaArr.push(sum / span);
    }
  }
  return smaArr;
}

function calculateEMA(data: number[], span: number): number[] {
  const k = 2 / (span + 1);
  let emaArr: number[] = [];
  let ema = data[0];
  emaArr.push(ema);
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    emaArr.push(ema);
  }
  return emaArr;
}

function calculateDEMA(data: number[], span: number): number[] {
  const ema = calculateEMA(data, span);
  const emaOfEma = calculateEMA(ema, span);
  return ema.map((val, i) => 2 * val - emaOfEma[i]);
}

type IndicatorType = 'SMA' | 'EMA' | 'DEMA';

function backtestStrategy(
  data: any[],
  indicatorType: IndicatorType,
  span1: number,
  span2: number,
  capital = 100000
): { chartData: any[]; trades: any[]; summary: any } {
  const close = data.map((row) => Number(row.Close));

  let indicator1: number[] = [];
  let indicator2: number[] = [];
  let indicatorName1 = "";
  let indicatorName2 = "";

  switch (indicatorType) {
    case 'SMA':
      indicator1 = calculateSMA(close, span1);
      indicator2 = calculateSMA(close, span2);
      indicatorName1 = `SMA ${span1}`;
      indicatorName2 = `SMA ${span2}`;
      break;
    case 'EMA':
      indicator1 = calculateEMA(close, span1);
      indicator2 = calculateEMA(close, span2);
      indicatorName1 = `EMA ${span1}`;
      indicatorName2 = `EMA ${span2}`;
      break;
    case 'DEMA':
      indicator1 = calculateDEMA(close, span1);
      indicator2 = calculateDEMA(close, span2);
      indicatorName1 = `DEMA ${span1}`;
      indicatorName2 = `DEMA ${span2}`;
      break;
    default:
      indicator1 = calculateDEMA(close, span1);
      indicator2 = calculateDEMA(close, span2);
      indicatorName1 = `DEMA ${span1}`;
      indicatorName2 = `DEMA ${span2}`;
      break;
  }

  let position: 'Long' | null = null;
  let trades: any[] = [];
  let buyPrice = 0;
  let shares = 0;
  let chartData: any[] = [];
  let currentCapital = capital;

  for (let i = 0; i < data.length; i++) {
    let signal = "Hold";

    const hasEnoughData = !isNaN(indicator1[i]) && !isNaN(indicator2[i]) &&
      (i > 0 && !isNaN(indicator1[i - 1]) && !isNaN(indicator2[i - 1]));

    if (
      hasEnoughData &&
      indicator1[i] > indicator2[i] &&
      indicator1[i - 1] <= indicator2[i - 1] &&
      position === null
    ) {
      signal = "Buy";
      buyPrice = close[i];
      shares = Math.floor(currentCapital / buyPrice);
      position = "Long";
      trades.push({
        Date: data[i].Date,
        Type: "Buy",
        Price: buyPrice,
        Shares: shares,
      });
    }
    else if (
      hasEnoughData &&
      indicator1[i] < indicator2[i] &&
      indicator1[i - 1] >= indicator2[i - 1] &&
      position === "Long"
    ) {
      signal = "Sell";
      const sellPrice = close[i];
      const profitPerShare = sellPrice - buyPrice;
      const totalProfit = profitPerShare * shares;

      currentCapital += totalProfit;

      trades.push({
        Date: data[i].Date,
        Type: "Sell",
        Price: sellPrice,
        Shares: shares,
        Profit_per_share: profitPerShare,
        Total_Profit: totalProfit,
      });
      position = null;
    }

    chartData.push({
      ...data[i],
      [indicatorName1.replace(/\s/g, "")]: indicator1[i],
      [indicatorName2.replace(/\s/g, "")]: indicator2[i],
      Signal: signal,
      [`${indicatorType}1`]: indicator1[i],
      [`${indicatorType}2`]: indicator2[i],
    });
  }

  const sellTrades = trades.filter((t) => t.Type === "Sell");
  const totalProfit = sellTrades.reduce((acc, t) => acc + (t.Total_Profit || 0), 0);
  const winTrades = sellTrades.filter((t) => (t.Total_Profit || 0) > 0);
  const lossTrades = sellTrades.filter((t) => (t.Total_Profit || 0) <= 0);

  const winRate = sellTrades.length > 0 ? (winTrades.length / sellTrades.length) * 100 : 0;
  const finalCapital = capital + totalProfit;
  const totalReturn = ((finalCapital - capital) / capital) * 100;

  return {
    chartData,
    trades,
    summary: {
      "Total Trades": sellTrades.length,
      "Total Profit": totalProfit,
      "Win Rate (%)": winRate.toFixed(2),
      "Total Return (%)": totalReturn.toFixed(2),
      "Final Capital": finalCapital,
      "Win Trades": winTrades.length,
      "Loss Trades": lossTrades.length,
      "Indicator Type": indicatorType,
      "Indicator 1 Span": span1,
      "Indicator 2 Span": span2,
    },
  };
}

interface CompanyData {
  fileName: string;
  chartData: any[];
  trades: any[];
  summary: any;
}

const CsvBacktest: React.FC = () => {
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [activeCompany, setActiveCompany] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>("chart");
  const [investment, setInvestment] = useState<number>(100000);
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorType>('DEMA');
  const [span1, setSpan1] = useState<number>(20);
  const [span2, setSpan2] = useState<number>(30);


  const [, setCurrentTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const html = document.documentElement;
      setCurrentTheme(html.classList.contains('dark') ? 'dark' : 'light');
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    setCurrentTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');

    return () => observer.disconnect();
  }, []);


  useEffect(() => {
    if (companies[activeCompany] && companies[activeCompany].chartData.length > 0) {
      setRange({ start: 0, end: companies[activeCompany].chartData.length - 1 });
    }
  }, [activeCompany, companies]);

  const getFilteredData = (data: any[]) => {
    if (!data || data.length === 0) return [];
    return data.slice(range.start, range.end + 1);
  };

  useEffect(() => {
    if (!companies.length) return;
    setCompanies((prev) =>
      prev.map((company) => {
        const data = company.chartData.map((row: any) => ({ ...row }));
        const { chartData, trades, summary } = backtestStrategy(
          data,
          selectedIndicator,
          span1,
          span2,
          investment
        );
        return { ...company, chartData, trades, summary };
      })
    );
  }, [investment, selectedIndicator, span1, span2]);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const filesArr = Array.from(files);
    let loaded = 0;
    const newCompanies: CompanyData[] = [];
    filesArr.forEach((file, idx) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const data = (results.data as string[][]).map((row) => ({
            Date: row[0],
            Open: row[1],
            High: row[2],
            Low: row[3],
            Close: row[4],
            Volume: row[5],
          }));
          data.forEach((row) => {
            if (row.Date && row.Date.includes(" ")) {
              row.Date = row.Date.split(" ")[0];
            }
          });
          const { chartData, trades, summary } = backtestStrategy(data, selectedIndicator, span1, span2, investment);
          newCompanies[idx] = {
            fileName: file.name,
            chartData,
            trades,
            summary,
          };
          loaded++;
          if (loaded === filesArr.length) {
            setCompanies((prev) => [...prev, ...newCompanies]);
            setActiveCompany(companies.length);
          }
        },
      });
    });
  };

  const topCompanies = companies
    .map((c) => ({
      name: c.fileName.replace(/\.csv$/, ""),
      profit: c.summary["Total Profit"],
      trades: c.summary["Total Trades"],
      winRate: c.summary["Win Rate (%)"],
      totalReturn: c.summary["Total Return (%)"],
    }))
    .sort((a, b) => b.profit - a.profit);

  const getChartData = (filteredChartData: any[], indicatorType: IndicatorType, s1: number, s2: number) => {
    const indicatorKey1 = `${indicatorType}1`;
    const indicatorKey2 = `${indicatorType}2`;

    return {
      labels: filteredChartData.map((d) => d.Date),
      datasets: [
        {
          label: "Close",
          data: filteredChartData.map((d) => +d.Close),
          borderColor: "#8884d8",
          backgroundColor: "#8884d8",
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: `${indicatorType} ${s1}`,
          data: filteredChartData.map((d) => +d[indicatorKey1]),
          borderColor: "#82ca9d",
          backgroundColor: "#82ca9d",
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: `${indicatorType} ${s2}`,
          data: filteredChartData.map((d) => +d[indicatorKey2]),
          borderColor: "#ff7300",
          backgroundColor: "#ff7300",
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: "Buy",
          data: filteredChartData.map((d) => (d.Signal === "Buy" ? +d.Close : null)),
          borderColor: "#00C49F",
          backgroundColor: "#00C49F",
          pointStyle: "triangle",
          pointRadius: 8,
          type: "line" as const,
          showLine: false,
        },
        {
          label: "Sell",
          data: filteredChartData.map((d) => (d.Signal === "Sell" ? +d.Close : null)),
          borderColor: "#FF4C4C",
          backgroundColor: "#FF4C4C",
          pointStyle: "rectRot",
          pointRadius: 8,
          type: "line" as const,
          showLine: false,
        },
      ],
    };
  };

  const topCompaniesBarData = {
    labels: topCompanies.map((c) => c.name),
    datasets: [
      {
        label: "Total Profit",
        data: topCompanies.map((c) => c.profit),
        backgroundColor: "#8884d8",
      },
    ],
  };

  const currentCompanyData = companies[activeCompany];
  const filteredChartData = currentCompanyData ? getFilteredData(currentCompanyData.chartData) : [];

  const selectedStartDate = filteredChartData[0]?.Date;
  const selectedEndDate = filteredChartData[filteredChartData.length - 1]?.Date;
  const numberOfDays = filteredChartData.length;

  return (
    <div className="flex flex-col lg:flex-row h-screen w-screen bg-background text-foreground overflow-hidden">
      <style>{`
        ::-webkit-scrollbar {
          width: 1px;
          height: 1px;
        }

        ::-webkit-scrollbar-track {
          background: var(--background);
        }

        ::-webkit-scrollbar-thumb {
          background-color: var(--primary);
          border-radius: 2px;
          border: 1px solid var(--background);
        }

        /* Handle on hover */
        ::-webkit-scrollbar-thumb:hover {
          background-color: var(--primary);
        }

        html {
          scrollbar-width: thin;
          scrollbar-color: var(--primary) var(--background);
        }
      `}</style>
      <div className="w-full lg:w-1/3 min-w-[250px] h-auto lg:h-full lg:overflow-y-auto bg-card border-r border-border shadow-md p-4 lg:p-6 flex-col justify-start hidden lg:flex">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">📊 DEMA Backtest Visualizer</h2>
          <ModeToggle />
        </div>
        <Input type="file" accept=".csv" onChange={handleFiles} className="mb-6" multiple />
        {companies.length > 0 && (
          <>
            <h3 className="text-xl font-bold mb-4">Top Companies by Total Profit</h3>
            <div className="relative h-[300px] lg:h-auto">
              <Bar
                data={topCompaniesBarData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false, // Important for controlling height
                  plugins: {
                    legend: { display: false },
                    title: {
                      display: true,
                      text: "Top Companies by Total Profit",
                      color: getCssVariable('--foreground')
                    },
                  },
                  scales: {
                    x: {
                      display: true,
                      title: { display: true, text: "Company", color: getCssVariable('--foreground') },
                      ticks: { color: getCssVariable('--foreground') },
                      grid: { color: getCssVariable('--border') }
                    },
                    y: {
                      display: true,
                      title: { display: true, text: "Total Profit", color: getCssVariable('--foreground') },
                      ticks: { color: getCssVariable('--foreground') },
                      grid: { color: getCssVariable('--border') }
                    },
                  },
                }}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm mt-6">
                <thead>
                  <tr>
                    <th className="px-2 py-1 border-b border-border text-center">Company</th>
                    <th className="px-2 py-1 border-b border-border text-center">Total Profit</th>
                    <th className="px-2 py-1 border-b border-border text-center">Return %</th>
                    <th className="px-2 py-1 border-b border-border text-center">Win Rate %</th>
                    <th className="px-2 py-1 border-b border-border text-center">Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {topCompanies.map((c) => (
                    <tr key={c.name} className="odd:bg-muted even:bg-background">
                      <td className="px-2 py-1 border-b border-border text-center">{c.name}</td>
                      <td className="px-2 py-1 border-b border-border text-center">{c.profit.toFixed(2)}</td>
                      <td className="px-2 py-1 border-b border-border text-center">{c.totalReturn}%</td>
                      <td className="px-2 py-1 border-b border-border text-center">{c.winRate}%</td>
                      <td className="px-2 py-1 border-b border-border text-center">{c.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 h-full overflow-y-auto bg-background p-4 lg:p-8 flex flex-col">
        <div className="lg:hidden w-full bg-card shadow-sm p-4 mb-4 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">📊 DEMA Backtest Visualizer</h2>
            <ModeToggle />
          </div>
          <Input type="file" accept=".csv" onChange={handleFiles} multiple />
        </div>

        {companies.length > 0 && currentCompanyData ? (
          <div className="flex flex-col gap-8">
            <div className="flex gap-2 border-b border-border mb-4 overflow-x-auto whitespace-nowrap">
              {companies.map((c, idx) => (
                <button
                  key={c.fileName}
                  className={`px-3 py-1 border-b-2 ${activeCompany === idx ? "border-primary font-bold" : "border-transparent"} flex-shrink-0 text-foreground hover:text-primary`}
                  onClick={() => setActiveCompany(idx)}
                >
                  {c.fileName.replace(/\.csv$/, "")}
                </button>
              ))}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-6 overflow-x-auto whitespace-nowrap bg-muted">
                <TabsTrigger value="chart" className="flex-shrink-0">Chart</TabsTrigger>
                <TabsTrigger value="trades" className="flex-shrink-0">Trade Log</TabsTrigger>
              </TabsList>

              <TabsContent value="chart">
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold">Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">Total Trades</span>
                        <span className="text-lg font-semibold">{currentCompanyData.summary["Total Trades"]}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">Win Trades</span>
                        <span className="text-lg font-semibold text-green-500">{currentCompanyData.summary["Win Trades"]}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">Loss Trades</span>
                        <span className="text-lg font-semibold text-destructive">{currentCompanyData.summary["Loss Trades"]}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">Total Profit</span>
                        <span className={`text-lg font-semibold ${currentCompanyData.summary["Total Profit"] >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                          {currentCompanyData.summary["Total Profit"].toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">Total Return</span>
                        <span className={`text-lg font-semibold ${currentCompanyData.summary["Total Return (%)"] >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                          {currentCompanyData.summary["Total Return (%)"]}%
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">Win Rate</span>
                        <span className="text-lg font-semibold">{currentCompanyData.summary["Win Rate (%)"]}%</span>
                      </div>
                      <div className="flex flex-col col-span-2 sm:col-span-3 md:col-span-4">
                        <span className="text-muted-foreground">Strategy:</span>
                        <span className="text-lg font-semibold">{currentCompanyData.summary["Indicator Type"]} ({currentCompanyData.summary["Indicator 1 Span"]}, {currentCompanyData.summary["Indicator 2 Span"]})</span>
                      </div>
                    </div>
                    <div className="flex flex-col md:flex-row items-center gap-4 mt-6">
                      <div className="flex items-center gap-2">
                        <label htmlFor="investment-input" className="text-sm font-medium text-muted-foreground">Investment:</label>
                        <Input
                          id="investment-input"
                          type="number"
                          min={1000}
                          step={1000}
                          value={investment}
                          onChange={e => setInvestment(Number(e.target.value))}
                          className="w-32 bg-input border-input text-foreground"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <label htmlFor="indicator-select" className="text-sm font-medium text-muted-foreground">Indicator:</label>
                        <Select value={selectedIndicator} onValueChange={(value: IndicatorType) => setSelectedIndicator(value)}>
                          <SelectTrigger id="indicator-select" className="w-[180px]">
                            <SelectValue placeholder="Select Indicator" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SMA">SMA (Simple Moving Average)</SelectItem>
                            <SelectItem value="EMA">EMA (Exponential Moving Average)</SelectItem>
                            <SelectItem value="DEMA">DEMA (Double Exponential Moving Average)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <label className="text-sm font-medium text-muted-foreground">Span 1 ({span1}):</label>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setSpan1(prev => Math.max(5, prev - 1))}
                          disabled={span1 <= 5}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Slider
                          min={5}
                          max={100}
                          step={1}
                          value={[span1]}
                          onValueChange={([val]) => setSpan1(Math.max(5, Math.min(100, val)))}
                          className="w-24"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setSpan1(prev => Math.min(100, prev + 1))}
                          disabled={span1 >= 100}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <label className="text-sm font-medium text-muted-foreground">Span 2 ({span2}):</label>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setSpan2(prev => Math.max(5, prev - 1))}
                          disabled={span2 <= 5}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Slider
                          min={5}
                          max={100}
                          step={1}
                          value={[span2]}
                          onValueChange={([val]) => setSpan2(Math.max(5, Math.min(100, val)))}
                          className="w-24"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setSpan2(prev => Math.min(100, prev + 1))}
                          disabled={span2 >= 100}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="relative h-[300px] lg:h-[500px]">
                  <Line
                    data={getChartData(filteredChartData, selectedIndicator, span1, span2)}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: "top" as const,
                          labels: {
                            color: getCssVariable('--foreground')
                          }
                        },
                        title: {
                          display: true,
                          text: `${selectedIndicator} Strategy Chart`,
                          color: getCssVariable('--foreground')
                        },
                      },
                      interaction: { mode: "index", intersect: false },
                      scales: {
                        x: {
                          display: true,
                          title: { display: true, text: "Date", color: getCssVariable('--foreground') },
                          ticks: { color: getCssVariable('--foreground') },
                          grid: { color: getCssVariable('--border') }
                        },
                        y: {
                          display: true,
                          title: { display: true, text: "Price", color: getCssVariable('--foreground') },
                          ticks: { color: getCssVariable('--foreground') },
                          grid: { color: getCssVariable('--border') }
                        },
                      },
                    }}
                  />
                </div>
                {currentCompanyData.chartData.length > 1 && (
                  <div className="flex flex-col items-center gap-2 my-6 w-full">
                    <div className="flex items-center justify-between w-full px-4 text-sm font-medium text-muted-foreground">
                      <span>{selectedStartDate}</span>
                      <span>{numberOfDays} days</span>
                      <span>{selectedEndDate}</span>
                    </div>
                    <div className="w-full px-4">
                      <Slider
                        min={0}
                        max={currentCompanyData.chartData.length - 1}
                        value={[range.start, range.end]}
                        step={1}
                        onValueChange={([start, end]) => setRange({ start, end })}
                      />
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="trades">
                <div className="mt-6 bg-card p-4 rounded-lg shadow-sm">
                  <h3 className="text-lg font-semibold mb-2">Trade Log</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-center">
                      <thead>
                        <tr>
                          <th className="px-2 py-1 border-b border-border">Date</th>
                          <th className="px-2 py-1 border-b border-border">Type</th>
                          <th className="px-2 py-1 border-b border-border">Price</th>
                          <th className="px-2 py-1 border-b border-border">Shares</th>
                          <th className="px-2 py-1 border-b border-border">Profit/Share</th>
                          <th className="px-2 py-1 border-b border-border">Total Profit</th>
                          <th className="px-2 py-1 border-b border-border">Win/Loss</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentCompanyData.trades.map((trade: any, idx: number) => {
                          const profit = trade.Type === "Sell" && typeof trade.Total_Profit === "number" ? trade.Total_Profit : null;
                          const winLoss = trade.Type === "Sell" ? (trade.Total_Profit > 0 ? "Win" : (trade.Total_Profit < 0 ? "Loss" : "Break Even")) : "-";
                          return (
                            <tr key={idx} className="odd:bg-muted even:bg-background">
                              <td className="px-2 py-1 border-b border-border">{trade.Date}</td>
                              <td className="px-2 py-1 border-b border-border">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${trade.Type === 'Buy' ? 'bg-accent/20 text-accent-foreground' : 'bg-destructive/20 text-destructive-foreground'
                                  }`}>
                                  {trade.Type}
                                </span>
                              </td>
                              <td className="px-2 py-1 border-b border-border">{typeof trade.Price === "number" ? trade.Price.toFixed(2) : trade.Price}</td>
                              <td className="px-2 py-1 border-b border-border">{trade.Shares}</td>
                              <td className="px-2 py-1 border-b border-border">{trade.Type === "Sell" && typeof trade.Profit_per_share === "number" ? trade.Profit_per_share.toFixed(2) : "-"}</td>
                              <td className={`px-2 py-1 border-b ${profit > 0 ? 'text-green-500 font-semibold' : profit < 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>{trade.Type === "Sell" && typeof trade.Total_Profit === "number" ? trade.Total_Profit.toFixed(2) : "-"}</td>
                              <td className={`px-2 py-1 border-b ${winLoss === 'Win' ? 'text-green-500 font-semibold' : winLoss === 'Loss' ? 'text-destructive font-semibold' : winLoss === 'Break Even' ? 'text-muted-foreground' : ''}`}>{winLoss}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="lg:hidden block mt-8 bg-card p-4 rounded-lg shadow-sm">
              {companies.length > 0 && (
                <>
                  <h3 className="text-xl font-bold mb-4">Top Companies by Total Profit</h3>
                  <div className="relative h-[300px] lg:h-auto">
                    <Bar
                      data={topCompaniesBarData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          title: { display: true, text: "Top Companies by Total Profit", color: getCssVariable('--foreground') },
                        },
                        scales: {
                          x: {
                            display: true,
                            title: { display: true, text: "Company", color: getCssVariable('--foreground') },
                            ticks: { color: getCssVariable('--foreground') },
                            grid: { color: getCssVariable('--border') }
                          },
                          y: {
                            display: true,
                            title: { display: true, text: "Total Profit", color: getCssVariable('--foreground') },
                            ticks: { color: getCssVariable('--foreground') },
                            grid: { color: getCssVariable('--border') }
                          },
                        },
                      }}
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm mt-6">
                      <thead>
                        <tr>
                          <th className="px-2 py-1 border-b border-border text-center">Company</th>
                          <th className="px-2 py-1 border-b border-border text-center">Total Profit</th>
                          <th className="px-2 py-1 border-b border-border text-center">Return %</th>
                          <th className="px-2 py-1 border-b border-border text-center">Win Rate %</th>
                          <th className="px-2 py-1 border-b border-border text-center">Trades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topCompanies.map((c) => (
                          <tr key={c.name} className="odd:bg-muted even:bg-background">
                            <td className="px-2 py-1 border-b border-border text-center">{c.name}</td>
                            <td className="px-2 py-1 border-b border-border text-center">{c.profit.toFixed(2)}</td>
                            <td className="px-2 py-1 border-b border-border text-center">{c.totalReturn}%</td>
                            <td className="px-2 py-1 border-b border-border text-center">{c.winRate}%</td>
                            <td className="px-2 py-1 border-b border-border text-center">{c.trades}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-lg">
            <p>Upload CSV files to begin backtesting.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CsvBacktest;
