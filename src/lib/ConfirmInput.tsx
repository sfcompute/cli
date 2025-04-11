import { ComponentProps, useCallback } from "react";
import TextInput from "ink-text-input";
import yn from "npm:yn";
import React from "react";

const noop = () => {};

interface ConfirmInputProps
  extends Omit<
    ComponentProps<typeof TextInput>,
    "value" | "onChange" | "onSubmit"
  > {
  isChecked?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: boolean) => void;
  placeholder?: string;
  value?: string;
}

const ConfirmInput = ({
  isChecked = false,
  onChange = noop,
  onSubmit = noop,
  placeholder = "",
  value = "",
  ...props
}: ConfirmInputProps) => {
  const handleSubmit = useCallback(
    (newValue: string) => {
      onSubmit(yn(newValue, { default: isChecked }));
    },
    [isChecked, onSubmit]
  );

  return (
    <TextInput
      {...props}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onSubmit={handleSubmit}
    />
  );
};

export default ConfirmInput;
