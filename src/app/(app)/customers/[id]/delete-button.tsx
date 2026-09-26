"use client";

import { deleteCustomer } from "../actions";

export default function DeleteCustomerButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  return (
    <form
      action={deleteCustomer}
      onSubmit={(e) => {
        if (
          !confirm(
            `Delete ${customerName}? This also deletes their notes and cannot be undone.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={customerId} />
      <button
        type="submit"
        className="btn-danger btn-sm"
      >
        Delete customer
      </button>
    </form>
  );
}
