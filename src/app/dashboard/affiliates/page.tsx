'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Trash2, Plus, TrendingUp, DollarSign } from 'lucide-react';

interface AffiliateCommission {
  id: number;
  affiliate_id: string;
  commission_percentage: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AffiliateStats {
  affiliate_id: string;
  booking_count: number;
  total_revenue: number;
  total_commission: number;
}

export default function AffiliatesPage() {
  const [commissions, setCommissions] = useState<AffiliateCommission[]>([]);
  const [stats, setStats] = useState<AffiliateStats[]>([]);
  const [availableAffiliates, setAvailableAffiliates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });
  const [formData, setFormData] = useState({
    affiliate_id: '',
    commission_percentage: '',
    notes: ''
  });

  const { toast } = useToast();

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load commissions
      const { data: commissionsData, error: commissionsError } = await supabase
        .from('affiliate_commissions')
        .select('*')
        .order('affiliate_id');

      if (commissionsError) throw commissionsError;
      setCommissions(commissionsData || []);

      // Load available affiliate IDs from activity_bookings
      const { data: affiliatesData, error: affiliatesError } = await supabase
        .from('activity_bookings')
        .select('affiliate_id')
        .not('affiliate_id', 'is', null);

      if (!affiliatesError && affiliatesData) {
        const uniqueAffiliates = [...new Set(affiliatesData.map(row => row.affiliate_id))]
          .filter(id => id)
          .sort();
        setAvailableAffiliates(uniqueAffiliates);
      }

      // Load stats from materialized view with date filtering
      const { data: directStats, error: directError } = await supabase
        .from('activity_bookings_participants_mv')
        .select('affiliate_id, total_price, affiliate_commission, start_date_time')
        .not('affiliate_id', 'is', null)
        .gte('start_date_time', `${dateRange.start}T00:00:00`)
        .lte('start_date_time', `${dateRange.end}T23:59:59`);

      if (!directError && directStats) {
        // Aggregate stats manually
        const aggregated = directStats.reduce((acc: Record<string, AffiliateStats>, row: {
          affiliate_id: string;
          total_price: string | number;
          affiliate_commission: string | number;
        }) => {
          if (!acc[row.affiliate_id]) {
            acc[row.affiliate_id] = {
              affiliate_id: row.affiliate_id,
              booking_count: 0,
              total_revenue: 0,
              total_commission: 0
            };
          }
          acc[row.affiliate_id].booking_count++;
          acc[row.affiliate_id].total_revenue += parseFloat(String(row.total_price || 0));
          acc[row.affiliate_id].total_commission += parseFloat(String(row.affiliate_commission || 0));
          return acc;
        }, {});

        setStats(Object.values(aggregated));
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const openDialog = (commission?: AffiliateCommission) => {
    if (commission) {
      setEditingId(commission.id);
      setFormData({
        affiliate_id: commission.affiliate_id,
        commission_percentage: commission.commission_percentage.toString(),
        notes: commission.notes || ''
      });
    } else {
      setEditingId(null);
      setFormData({
        affiliate_id: '',
        commission_percentage: '',
        notes: ''
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const percentage = parseFloat(formData.commission_percentage);

      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        toast({
          title: 'Invalid percentage',
          description: 'Commission percentage must be between 0 and 100',
          variant: 'destructive'
        });
        return;
      }

      const payload = {
        affiliate_id: formData.affiliate_id.trim(),
        commission_percentage: percentage,
        notes: formData.notes.trim() || null,
        updated_at: new Date().toISOString()
      };

      if (editingId) {
        // Update existing
        const { error } = await supabase
          .from('affiliate_commissions')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Commission updated successfully'
        });
      } else {
        // Insert new
        const { error } = await supabase
          .from('affiliate_commissions')
          .insert(payload);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Commission added successfully'
        });
      }

      setDialogOpen(false);
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (id: number, affiliateId: string) => {
    if (!confirm(`Delete commission for ${affiliateId}?`)) return;

    try {
      const { error } = await supabase
        .from('affiliate_commissions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Commission deleted successfully'
      });

      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive'
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  const getStatsForAffiliate = (affiliateId: string) => {
    return stats.find(s => s.affiliate_id === affiliateId);
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Affiliate Commissions</h1>
          <p className="text-muted-foreground">Manage commission rates for each affiliate</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Commission
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit' : 'Add'} Commission</DialogTitle>
                <DialogDescription>
                  Set the commission percentage for an affiliate
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="affiliate_id">Affiliate ID</Label>
                  <Select
                    value={formData.affiliate_id}
                    onValueChange={(value) => setFormData({ ...formData, affiliate_id: value })}
                    disabled={!!editingId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select affiliate..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAffiliates.map((affiliateId) => (
                        <SelectItem key={affiliateId} value={affiliateId}>
                          {affiliateId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="percentage">Commission Percentage (%)</Label>
                  <Input
                    id="percentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.commission_percentage}
                    onChange={(e) => setFormData({ ...formData, commission_percentage: e.target.value })}
                    placeholder="10.00"
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Example: 10.5 means 10.5% commission
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Optional notes about this commission"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingId ? 'Update' : 'Add'} Commission
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Date Range Filters */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="start-date">Data Inizio</Label>
          <Input
            id="start-date"
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="end-date">Data Fine</Label>
          <Input
            id="end-date"
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Affiliates</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{commissions.length}</div>
            <p className="text-xs text-muted-foreground">
              with commission rates set
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.reduce((sum, s) => sum + s.booking_count, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              from all affiliates
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commissions</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.reduce((sum, s) => sum + s.total_commission, 0))}
            </div>
            <p className="text-xs text-muted-foreground">
              calculated from bookings
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Commissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Commission Rates</CardTitle>
          <CardDescription>
            Manage commission percentages for each affiliate. The commission is automatically calculated in the materialized view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Affiliate ID</TableHead>
                <TableHead>Commission %</TableHead>
                <TableHead>Bookings</TableHead>
                <TableHead>Total Revenue</TableHead>
                <TableHead>Total Commission</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No commission rates configured. Add one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                commissions.map((commission) => {
                  const affiliateStats = getStatsForAffiliate(commission.affiliate_id);
                  return (
                    <TableRow key={commission.id}>
                      <TableCell className="font-medium">{commission.affiliate_id}</TableCell>
                      <TableCell>{commission.commission_percentage}%</TableCell>
                      <TableCell>{affiliateStats?.booking_count || 0}</TableCell>
                      <TableCell>{formatCurrency(affiliateStats?.total_revenue || 0)}</TableCell>
                      <TableCell className="font-medium text-green-600">
                        {formatCurrency(affiliateStats?.total_commission || 0)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {commission.notes || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(commission)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(commission.id, commission.affiliate_id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
