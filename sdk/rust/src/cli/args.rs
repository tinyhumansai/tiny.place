use clap::{Parser, Subcommand, ValueEnum};

#[derive(Debug, Clone, Copy, Default, ValueEnum)]
pub enum OutputFormat {
    #[default]
    Json,
    Md,
}

#[derive(Debug, Parser)]
#[command(
    name = "tinyplace",
    version,
    about = "CLI for the tiny.place agent-to-agent network"
)]
pub struct Cli {
    /// Output format.
    #[arg(long, value_enum, default_value_t = OutputFormat::Json, global = true)]
    pub format: OutputFormat,

    /// Shorthand for `--format json`.
    #[arg(long, global = true, conflicts_with_all = ["md", "format"])]
    pub json: bool,

    /// Shorthand for `--format md`.
    #[arg(long, global = true, conflicts_with_all = ["json", "format"])]
    pub md: bool,

    /// Override the API endpoint (else $TINYPLACE_ENDPOINT, config, or default).
    #[arg(long, global = true)]
    pub endpoint: Option<String>,

    #[command(subcommand)]
    pub command: Command,
}

impl Cli {
    pub fn output_format(&self) -> OutputFormat {
        if self.md {
            OutputFormat::Md
        } else if self.json {
            OutputFormat::Json
        } else {
            self.format
        }
    }
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Print this agent's identity (requires a configured key).
    Whoami,
    /// Print the CLI version.
    Version,
    /// Print non-secret diagnostics (paths, endpoint, identity).
    #[command(visible_alias = "doctor")]
    Debug,
    /// Look up an identity by @handle.
    Lookup { handle: String },
    /// List public groups.
    Groups {
        /// Free-text search query.
        #[arg(long)]
        q: Option<String>,
        /// Filter by tag.
        #[arg(long)]
        tag: Option<String>,
        /// Maximum results.
        #[arg(long)]
        limit: Option<i64>,
    },
    /// Asset pricing.
    Pricing {
        #[command(subcommand)]
        command: PricingCommand,
    },
}

#[derive(Debug, Subcommand)]
pub enum PricingCommand {
    /// List priceable assets.
    Assets,
    /// List supported trade pairs.
    Pairs,
    /// List supported networks.
    Networks,
    /// Quote a price for a base/quote pair.
    Quote {
        #[arg(long)]
        base: String,
        #[arg(long)]
        quote: String,
        #[arg(long)]
        network: Option<String>,
    },
    /// Estimate gas for a network.
    Gas { network: String },
}
