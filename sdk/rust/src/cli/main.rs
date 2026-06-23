mod args;
mod commands;
mod config;
mod context;
mod output;

use std::process::ExitCode;

use clap::Parser;

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    let cli = args::Cli::parse();
    match commands::run(cli).await {
        Ok(stdout) => {
            print!("{stdout}");
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprint!("{}", err.to_stderr_json());
            ExitCode::FAILURE
        }
    }
}
