"use client";

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  KeyRound,
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  X,
  CheckCircle2,
  Loader2,
  LogIn,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type { UserAccount } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

interface UserAccountsManagerProps {
  projectId: string;
  accounts: UserAccount[];
  onCreateAccount: (label: string, email: string, password: string, metadata?: Record<string, string>) => void;
  onUpdateAccount: (id: string, updates: Partial<UserAccount>) => void;
  onDeleteAccount: (id: string) => void;
  onLogin: (account: UserAccount, providerColumn: 'hyperbrowser' | 'browser-use-cloud') => void;
  onClearProfile: (account: UserAccount, providerColumn: 'hyperbrowser' | 'browser-use-cloud') => void;
}

interface MetadataRow {
  key: string;
  value: string;
}

type SheetMode = 'create' | 'edit' | null;

export function UserAccountsManager({
  accounts,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
  onLogin,
  onClearProfile,
}: UserAccountsManagerProps) {
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);

  // Form state
  const [formLabel, setFormLabel] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formMetadata, setFormMetadata] = useState<MetadataRow[]>([]);
  const [formShowPassword, setFormShowPassword] = useState(false);

  const activeAccount =
    sheetMode === 'edit' && activeAccountId
      ? accounts.find((account) => account.id === activeAccountId) || null
      : null;

  const resetForm = () => {
    setFormLabel('');
    setFormEmail('');
    setFormPassword('');
    setFormMetadata([]);
    setFormShowPassword(false);
  };

  const applyAccountToForm = (account: UserAccount) => {
    setFormLabel(account.label);
    setFormEmail(account.email);
    setFormPassword(account.password);
    setFormMetadata(
      account.metadata
        ? Object.entries(account.metadata).map(([key, value]) => ({ key, value }))
        : []
    );
    setFormShowPassword(false);
  };

  const openCreateSheet = () => {
    resetForm();
    setActiveAccountId(null);
    setSheetMode('create');
  };

  const openEditSheet = (account: UserAccount) => {
    applyAccountToForm(account);
    setActiveAccountId(account.id);
    setSheetMode('edit');
  };

  const closeSheet = () => {
    setSheetMode(null);
    setActiveAccountId(null);
    resetForm();
  };

  const buildMetadataFromForm = (): Record<string, string> | undefined => {
    const metadata: Record<string, string> = {};
    for (const row of formMetadata) {
      if (row.key.trim() && row.value.trim()) {
        metadata[row.key.trim()] = row.value.trim();
      }
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  };

  const handleSave = () => {
    if (!formLabel.trim() || !formEmail.trim() || !formPassword.trim()) return;

    const metadata = buildMetadataFromForm();

    if (sheetMode === 'edit' && activeAccountId) {
      onUpdateAccount(activeAccountId, {
        label: formLabel.trim(),
        email: formEmail.trim(),
        password: formPassword,
        metadata,
      });
    } else {
      onCreateAccount(formLabel.trim(), formEmail.trim(), formPassword, metadata);
    }

    closeSheet();
  };

  const handleAddMetadataRow = () => {
    setFormMetadata([...formMetadata, { key: '', value: '' }]);
  };

  const handleRemoveMetadataRow = (index: number) => {
    setFormMetadata(formMetadata.filter((_, i) => i !== index));
  };

  const handleMetadataChange = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...formMetadata];
    updated[index] = { ...updated[index], [field]: val };
    setFormMetadata(updated);
  };

  const confirmDelete = () => {
    if (!deleteAccountId) return;

    onDeleteAccount(deleteAccountId);
    if (activeAccountId === deleteAccountId) {
      closeSheet();
    }
    setDeleteAccountId(null);
  };

  const getProfileStatusBadge = (status: 'none' | 'authenticating' | 'authenticated' | 'expired') => {
    switch (status) {
      case 'authenticated':
        return (
          <Badge className="bg-[#30a46c]/8 text-[#30a46c] border-[#30a46c]/15 text-[10px] font-medium px-1.5 py-0">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Authenticated
          </Badge>
        );
      case 'authenticating':
        return (
          <Badge className="bg-[#f5a623]/8 text-[#f5a623] border-[#f5a623]/15 text-[10px] font-medium px-1.5 py-0">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Authenticating...
          </Badge>
        );
      case 'expired':
        return (
          <Badge className="bg-orange-500/8 text-orange-500 border-orange-500/15 text-[10px] font-medium px-1.5 py-0">
            Expired
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0">
            Logged out
          </Badge>
        );
    }
  };

  const getProviderProfile = (account: UserAccount, providerColumn: 'hyperbrowser' | 'browser-use-cloud') => {
    if (providerColumn === 'browser-use-cloud') return account.providerProfiles?.browserUseCloud;
    return account.providerProfiles?.hyperbrowser;
  };

  const buildProviderActionAccount = (): UserAccount | null => {
    if (!activeAccount) return null;
    return {
      ...activeAccount,
      label: formLabel.trim() || activeAccount.label,
      email: formEmail.trim() || activeAccount.email,
      password: formPassword || activeAccount.password,
      metadata: buildMetadataFromForm(),
    };
  };

  const renderProviderStateCell = (account: UserAccount, providerColumn: 'hyperbrowser' | 'browser-use-cloud') => {
    const providerProfile = getProviderProfile(account, providerColumn);
    const status = providerProfile?.status || 'none';

    return (
      <div>
        {getProfileStatusBadge(status)}
      </div>
    );
  };

  const renderProviderControls = (
    providerColumn: 'hyperbrowser' | 'browser-use-cloud',
    label: string,
    accountForActions: UserAccount | null
  ) => {
    if (!activeAccount || !accountForActions) return null;

    const providerProfile = getProviderProfile(activeAccount, providerColumn);
    const status = providerProfile?.status || 'none';
    const showRelogin = status === 'authenticated' || status === 'expired';

    return (
      <div className="rounded-md border border-border/40 bg-card/40 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-medium">{label}</p>
          {getProfileStatusBadge(status)}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[11px] px-2 whitespace-nowrap"
            onClick={() => onLogin(accountForActions, providerColumn)}
            disabled={status === 'authenticating'}
          >
            {status === 'authenticating' ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : showRelogin ? (
              <RefreshCw className="mr-1 h-3 w-3" />
            ) : (
              <LogIn className="mr-1 h-3 w-3" />
            )}
            {showRelogin ? 'Re-login' : 'Login'}
          </Button>
          {providerProfile?.profileId && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] px-2 whitespace-nowrap"
              onClick={() => onClearProfile(accountForActions, providerColumn)}
              disabled={status === 'authenticating'}
            >
              <XCircle className="mr-1 h-3 w-3" />
              Logout
            </Button>
          )}
        </div>

        {providerProfile?.lastAuthenticatedAt && status !== 'none' && (
          <p className="mt-2 text-[10px] text-muted-foreground tabular-nums">
            Updated {formatRelativeTime(providerProfile.lastAuthenticatedAt)}
          </p>
        )}
      </div>
    );
  };

  const accountForActions = buildProviderActionAccount();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {accounts.length} / 20
        </Badge>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={openCreateSheet}
          disabled={accounts.length >= 20}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card className="border-border/40">
          <CardContent className="py-10 text-center">
            <KeyRound className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-medium mb-1">No user accounts</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add test user credentials for authenticated test scenarios
            </p>
            <Button size="sm" className="h-7 text-xs" onClick={openCreateSheet}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border border-border/40">
          <div className="overflow-x-auto">
            <Table className="min-w-[1120px]">
              <TableHeader>
                <TableRow className="border-border/40 bg-muted/20 hover:bg-muted/20">
                  <TableHead className="w-[180px]">Label</TableHead>
                  <TableHead className="w-[240px]">Email</TableHead>
                  <TableHead className="w-[220px]">Metadata</TableHead>
                  <TableHead className="w-[110px]">Created</TableHead>
                  <TableHead className="w-[170px]">Hyperbrowser</TableHead>
                  <TableHead className="w-[170px]">Browser Use</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const hasMetadata = account.metadata && Object.keys(account.metadata).length > 0;
                  const metadataEntries = hasMetadata ? Object.entries(account.metadata!) : [];
                  const visibleMetadata = metadataEntries.slice(0, 2);
                  const remainingMetadataCount = Math.max(0, metadataEntries.length - visibleMetadata.length);

                  return (
                    <TableRow
                      key={account.id}
                      className="cursor-pointer hover:bg-accent/20"
                      onClick={() => openEditSheet(account)}
                    >
                      <TableCell className="py-2.5">
                        <span className="text-sm font-medium">{account.label}</span>
                      </TableCell>

                      <TableCell className="py-2.5">
                        <span className="text-sm text-muted-foreground break-all">{account.email}</span>
                      </TableCell>

                      <TableCell className="py-2.5">
                        {hasMetadata ? (
                          <div className="flex flex-wrap gap-1">
                            {visibleMetadata.map(([key, value]) => (
                              <Badge key={key} variant="outline" className="text-[10px] px-1.5 py-0">
                                {key}: {value}
                              </Badge>
                            ))}
                            {remainingMetadataCount > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                +{remainingMetadataCount} more
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>

                      <TableCell className="py-2.5">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatRelativeTime(account.createdAt)}
                        </span>
                      </TableCell>

                      <TableCell className="py-2.5 align-top">
                        {renderProviderStateCell(account, 'hyperbrowser')}
                      </TableCell>

                      <TableCell className="py-2.5 align-top">
                        {renderProviderStateCell(account, 'browser-use-cloud')}
                      </TableCell>

                      <TableCell className="py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditSheet(account)}>
                              <Edit2 className="mr-2 h-3.5 w-3.5" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteAccountId(account.id)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Sheet open={sheetMode !== null} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-sm">
              {sheetMode === 'create' ? 'Add Account' : activeAccount?.label || 'Edit Account'}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {sheetMode === 'create'
                ? 'Create a new account for authenticated test scenarios.'
                : 'Update account details and manage provider sessions.'}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-4 pb-6">
            <div className="space-y-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Account Details</p>

              <div className="space-y-1.5">
                <Label htmlFor="account-label" className="text-xs font-medium">Label</Label>
                <Input
                  id="account-label"
                  placeholder="e.g., Admin User, Test Customer"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="account-email" className="text-xs font-medium">Email</Label>
                <Input
                  id="account-email"
                  type="email"
                  placeholder="user@example.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="account-password" className="text-xs font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="account-password"
                    type={formShowPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="h-8 text-sm pr-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-8 w-8"
                    onClick={() => setFormShowPassword(!formShowPassword)}
                  >
                    {formShowPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Metadata (optional)</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={handleAddMetadataRow}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add Field
                  </Button>
                </div>
                {formMetadata.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="Key"
                      value={row.key}
                      onChange={(e) => handleMetadataChange(index, 'key', e.target.value)}
                      className="h-7 text-xs flex-1"
                    />
                    <Input
                      placeholder="Value"
                      value={row.value}
                      onChange={(e) => handleMetadataChange(index, 'value', e.target.value)}
                      className="h-7 text-xs flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => handleRemoveMetadataRow(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {sheetMode === 'edit' && activeAccount && (
              <div className="space-y-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Provider Sessions</p>
                {renderProviderControls('hyperbrowser', 'Hyperbrowser', accountForActions)}
                {renderProviderControls('browser-use-cloud', 'Browser Use', accountForActions)}
              </div>
            )}

            {sheetMode === 'create' && (
              <div className="rounded-md border border-border/40 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  Save this account first. Then open it from the list to log in and manage sessions per provider.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeSheet}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleSave}
                disabled={!formLabel.trim() || !formEmail.trim() || !formPassword.trim()}
              >
                {sheetMode === 'create' ? 'Add Account' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteAccountId} onOpenChange={(open) => { if (!open) setDeleteAccountId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">Delete Account?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will permanently delete this user account. Any test cases using this account will be unassigned.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs" onClick={() => setDeleteAccountId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
