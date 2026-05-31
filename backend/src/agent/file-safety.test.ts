import { describe, expect, it } from "vitest";
import { getReadBlockError, getWriteBlockError } from "./file-safety";

describe("getReadBlockError", () => {
  it("blocks reading .env", () => {
    expect(getReadBlockError("/home/user/project/.env")).not.toBeNull();
  });
  it("allows .env.example", () => {
    expect(getReadBlockError("/home/user/project/.env.example")).toBeNull();
  });
  it("blocks SSH private keys", () => {
    expect(getReadBlockError("/home/user/.ssh/id_rsa")).not.toBeNull();
  });
  it("blocks cloud credential dirs", () => {
    expect(getReadBlockError("/home/user/.aws/credentials")).not.toBeNull();
  });
  it("allows normal files", () => {
    expect(getReadBlockError("/home/user/report.csv")).toBeNull();
  });
});

describe("getWriteBlockError", () => {
  it("blocks shell-init files", () => {
    expect(getWriteBlockError("/home/user/.bashrc")).not.toBeNull();
  });
  it("blocks authorized_keys", () => {
    expect(getWriteBlockError("/home/user/.ssh/authorized_keys")).not.toBeNull();
  });
  it("blocks .env", () => {
    expect(getWriteBlockError("/home/user/.env")).not.toBeNull();
  });
  it("blocks /etc paths", () => {
    expect(getWriteBlockError("/etc/passwd")).not.toBeNull();
  });
  it("allows normal output files", () => {
    expect(getWriteBlockError("/home/user/out.txt")).toBeNull();
  });
  it("allows .env.example", () => {
    expect(getWriteBlockError("/home/user/.env.example")).toBeNull();
  });
});
