import { Component, NgZone, OnDestroy, OnInit, TemplateRef, ViewChild } from '@angular/core';

import _ from 'lodash';
import { forkJoin as observableForkJoin, Observable, Subscriber, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { RgwBucketService } from '~/app/shared/api/rgw-bucket.service';
import { ListWithDetails } from '~/app/shared/classes/list-with-details.class';
import { DeleteConfirmationModalComponent } from '~/app/shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { ActionLabelsI18n } from '~/app/shared/constants/app.constants';
import { TableComponent } from '~/app/shared/datatable/table/table.component';
import { Icons } from '~/app/shared/enum/icons.enum';
import { CdTableAction } from '~/app/shared/models/cd-table-action';
import { CdTableColumn } from '~/app/shared/models/cd-table-column';
import { CdTableFetchDataContext } from '~/app/shared/models/cd-table-fetch-data-context';
import { CdTableSelection } from '~/app/shared/models/cd-table-selection';
import { Permission } from '~/app/shared/models/permissions';
import { DimlessBinaryPipe } from '~/app/shared/pipes/dimless-binary.pipe';
import { DimlessPipe } from '~/app/shared/pipes/dimless.pipe';
import { AuthStorageService } from '~/app/shared/services/auth-storage.service';
import { ModalService } from '~/app/shared/services/modal.service';
import { URLBuilderService } from '~/app/shared/services/url-builder.service';
import { Bucket } from '../models/rgw-bucket';
import { DeletionImpact } from '~/app/shared/enum/delete-confirmation-modal-impact.enum';

const BASE_URL = 'rgw/bucket';

@Component({
  selector: 'cd-rgw-bucket-list',
  templateUrl: './rgw-bucket-list.component.html',
  styleUrls: ['./rgw-bucket-list.component.scss'],
  providers: [{ provide: URLBuilderService, useValue: new URLBuilderService(BASE_URL) }]
})
export class RgwBucketListComponent extends ListWithDetails implements OnInit, OnDestroy {
  @ViewChild(TableComponent, { static: true })
  table: TableComponent;
  @ViewChild('bucketSizeTpl', { static: true })
  bucketSizeTpl: TemplateRef<any>;
  @ViewChild('bucketObjectTpl', { static: true })
  bucketObjectTpl: TemplateRef<any>;

  permission: Permission;
  tableActions: CdTableAction[];
  columns: CdTableColumn[] = [];
  buckets: Bucket[] = [];
  selection: CdTableSelection = new CdTableSelection();
  declare staleTimeout: number;
  private subs: Subscription = new Subscription();

  constructor(
    private authStorageService: AuthStorageService,
    private dimlessBinaryPipe: DimlessBinaryPipe,
    private dimlessPipe: DimlessPipe,
    private rgwBucketService: RgwBucketService,
    private modalService: ModalService,
    private urlBuilder: URLBuilderService,
    public actionLabels: ActionLabelsI18n,
    protected ngZone: NgZone
  ) {
    super(ngZone);
  }

  ngOnInit() {
    this.permission = this.authStorageService.getPermissions().rgw;
    this.columns = [
      {
        name: $localize`Name`,
        prop: 'bid',
        flexGrow: 2
      },
      {
        name: $localize`Owner`,
        prop: 'owner',
        flexGrow: 2.5
      },
      {
        name: $localize`Used Capacity`,
        prop: 'bucket_size',
        flexGrow: 0.6,
        pipe: this.dimlessBinaryPipe
      },
      {
        name: $localize`Capacity Limit %`,
        prop: 'size_usage',
        cellTemplate: this.bucketSizeTpl,
        flexGrow: 0.8
      },
      {
        name: $localize`Objects`,
        prop: 'num_objects',
        flexGrow: 0.6,
        pipe: this.dimlessPipe
      },
      {
        name: $localize`Object Limit %`,
        prop: 'object_usage',
        cellTemplate: this.bucketObjectTpl,
        flexGrow: 0.8
      }
    ];
    const getBucketUri = () =>
      this.selection.first() && `${encodeURIComponent(this.selection.first().bid)}`;
    const addAction: CdTableAction = {
      permission: 'create',
      icon: Icons.add,
      routerLink: () => this.urlBuilder.getCreate(),
      name: this.actionLabels.CREATE,
      canBePrimary: (selection: CdTableSelection) => !selection.hasSelection
    };
    const editAction: CdTableAction = {
      permission: 'update',
      icon: Icons.edit,
      routerLink: () => this.urlBuilder.getEdit(getBucketUri()),
      name: this.actionLabels.EDIT
    };
    const deleteAction: CdTableAction = {
      permission: 'delete',
      icon: Icons.destroy,
      click: () => this.deleteAction(),
      disable: () => this.isDeleteDisabled(),
      name: this.actionLabels.DELETE
    };
    this.tableActions = [addAction, editAction, deleteAction];
    this.setTableRefreshTimeout();
  }

  isDeleteDisabled(): boolean | string {
    if (!this.selection.first()) {
      return true;
    }
    return this.selection.first()?.num_objects > 0
      ? $localize`Bucket is not empty. Remove all objects before deletion.`
      : false;
  }

  getBucketList(context: CdTableFetchDataContext) {
    this.setTableRefreshTimeout();
    this.subs.add(
      this.rgwBucketService
        .fetchAndTransformBuckets()
        .pipe(switchMap(() => this.rgwBucketService.buckets$))
        .subscribe({
          next: (buckets) => {
            this.buckets = buckets;
          },
          error: () => context.error()
        })
    );
  }

  updateSelection(selection: CdTableSelection) {
    this.selection = selection;
  }

  deleteAction() {
    const itemNames = this.selection.selected.map((bucket: any) => bucket['bid']);
    this.modalService.show(DeleteConfirmationModalComponent, {
      itemDescription: $localize`bucket`,
      impact: DeletionImpact.high,
      itemNames: itemNames,
      submitActionObservable: () => {
        return new Observable((observer: Subscriber<any>) => {
          // Delete all selected data table rows.
          observableForkJoin(
            this.selection.selected.map((bucket: any) => {
              return this.rgwBucketService.delete(bucket.bid);
            })
          ).subscribe({
            error: (error) => {
              // Forward the error to the observer.
              observer.error(error);
              // Reload the data table content because some deletions might
              // have been executed successfully in the meanwhile.
              this.table.refreshBtn();
            },
            complete: () => {
              // Notify the observer that we are done.
              observer.complete();
              // Reload the data table content.
              this.table.refreshBtn();
            }
          });
        });
      }
    });
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}
